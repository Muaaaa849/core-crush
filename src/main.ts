import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Avatar } from './game/avatar';
import { Bot } from './game/bot';
import { CameraBlend } from './game/camera';
import { Controls } from './game/controls';
import { Hud } from './game/hud';
import { SimRunner } from './game/runner';
import { CameraOcclusion } from './occlusion';
import { defaultConfig as config } from './sim/config';
import { createInitialState } from './sim/sim';
import type { SimState } from './sim/types';
import { beginFrame, gpuDone, gpuName } from './gpu';
import { StatsOverlay } from './stats';
import './style.css';

const CHARACTER_HEIGHT = 1.8; // m。モデルの寸法ではなくゲーム側の基準で決める
const params = new URLSearchParams(location.search);

const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: params.get('backend') === 'webgl' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.AgXToneMapping;
document.body.append(renderer.domElement);
await renderer.init();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060b);
const camera = new THREE.PerspectiveCamera(90, innerWidth / innerHeight, 0.05, 500);

const stats = new StatsOverlay(renderer, gpuName(renderer), params.has('stats'));
const overlay = document.querySelector<HTMLDivElement>('#overlay')!;
const startButton = document.querySelector<HTMLButtonElement>('#start')!;

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
async function load(name: string): Promise<GLTF> {
  const started = performance.now();
  const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}assets/${name}.glb?v=${__ASSET_VERSIONS__[name]}`);
  stats.loads[name] = Math.round(performance.now() - started);
  return gltf;
}

const loadStarted = performance.now();
const [stage, ball, character] = await Promise.all([load('stage'), load('core_ball'), load('character')]);
stats.loads.total = Math.round(performance.now() - loadStarted);

// Blenderの書き出しはW×683（lm/W）で光度へ換算している。three.jsでBlenderと同じ明るさにするため戻す。
const BLENDER_LUMENS_PER_WATT = 683;
stage.scene.traverse((o) => {
  if (o instanceof THREE.Light) o.intensity /= BLENDER_LUMENS_PER_WATT;
});
scene.add(stage.scene);
const stageMixer = new THREE.AnimationMixer(stage.scene);
for (const clip of stage.animations) {
  if (/^(idle|hover_idle)/.test(clip.name)) stageMixer.clipAction(clip).play();
}

// 試合球は見た目と判定を同じ大きさにする（rules.md M1細則）。モデルは直径約0.22m。
const BALL_MODEL_DIAMETER = 0.22;
ball.scene.scale.setScalar(config.ballDiameter / BALL_MODEL_DIAMETER);
scene.add(ball.scene);

const height = new THREE.Box3().setFromObject(character.scene).getSize(new THREE.Vector3()).y;
character.scene.scale.setScalar(CHARACTER_HEIGHT / height);
const opponentModel = cloneSkinned(character.scene);
scene.add(character.scene, opponentModel);
const avatars = {
  p1: new Avatar(character.scene, character.animations),
  p2: new Avatar(opponentModel, character.animations),
};

// 初球の陣は試合ごとに抽選（rules.md）。sim内では乱数を使わないため、ここで決める。
const runner = new SimRunner(createInitialState(Math.random() < 0.5 ? 'p1' : 'p2'), config, [new Bot('p2')]);
const controls = new Controls(renderer.domElement, runner, 'p1');
const hud = new Hud(document.querySelector<HTMLElement>('#hud')!, config, 'p1');
const occlusion = new CameraOcclusion(stage.scene);
const cameraBlend = new CameraBlend();
const lookTargets = [new THREE.Vector3(), new THREE.Vector3()]; // キャラの頭と胸

/** 直前と最新のsim状態の間を補間した足元の位置。 */
function playerPosition(id: 'p1' | 'p2', out: THREE.Vector3): THREE.Vector3 {
  const index = id === 'p1' ? 0 : 1;
  const a = runner.previous.players[index].position;
  const b = runner.state.players[index].position;
  return out.set(a.x, 0, a.z).lerp(new THREE.Vector3(b.x, 0, b.z), runner.alpha);
}

// 保持中の球の表示位置（キャラの向き基準）。FPSでは画面右下へ寄せ、正面の視界を空ける（feel.md）。
const HELD = { forward: 0.45, right: 0, height: 1.2 };
const HELD_FPS = { forward: 1.1, right: 0.6, height: 0.95 };
function placeBall(state: SimState): void {
  const b = state.ball;
  ball.scene.visible = b.mode !== 'absent';
  if (b.mode === 'held') {
    const holder = state.players.find((p) => p.id === b.owner)!;
    const at = playerPosition(holder.id, new THREE.Vector3());
    const yaw = holder.id === 'p1' ? controls.yaw : holder.yaw;
    const t = holder.id === 'p1' ? cameraBlend.fps : 0;
    const forward = THREE.MathUtils.lerp(HELD.forward, HELD_FPS.forward, t);
    const right = THREE.MathUtils.lerp(HELD.right, HELD_FPS.right, t);
    ball.scene.position.set(
      at.x - Math.sin(yaw) * forward + Math.cos(yaw) * right,
      THREE.MathUtils.lerp(HELD.height, HELD_FPS.height, t),
      at.z - Math.cos(yaw) * forward - Math.sin(yaw) * right,
    );
  } else if (b.mode === 'loose' || b.mode === 'flight') {
    ball.scene.position.set(b.position.x, b.position.y, b.position.z);
  }
}

const scenePass = pass(scene, camera);
const color = scenePass.getTextureNode('output');
const pipeline = new THREE.RenderPipeline(renderer, color.add(bloom(color, 0.6, 0.2, 0.9)));

startButton.textContent = 'プレイ開始';
startButton.disabled = false;
startButton.addEventListener('click', () => {
  const canvas = renderer.domElement;
  // 生入力（OSのマウス加速なし）に非対応の環境では通常の捕捉にする。失敗はpointerlockerrorで案内する。
  canvas.requestPointerLock({ unadjustedMovement: true }).catch(() => canvas.requestPointerLock().catch(() => {}));
});
document.addEventListener('pointerlockchange', () => {
  overlay.hidden = controls.locked;
});
document.addEventListener('pointerlockerror', () => {
  startButton.textContent = 'マウスを捕捉できませんでした。もう一度クリック';
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

if (import.meta.env.DEV) Object.assign(window, { __debug: { scene, renderer, runner, camera, step, gpuDone } });

const tmp = new THREE.Vector3();
function step(dt: number): void {
  controls.update();
  runner.advance(dt * 1000);
  const state = runner.state;
  cameraBlend.update(state, 'p1', dt * 1000);
  for (const id of ['p1', 'p2'] as const) {
    const yaw = id === 'p1' ? controls.yaw : state.players[1].yaw;
    avatars[id].update(playerPosition(id, tmp), yaw, dt);
  }
  placeBall(state);
  avatars.p1.root.visible = cameraBlend.fps < 0.5; // FPS中は自分の体で視界を塞がない
  ball.scene.rotation.y += dt * 0.6;
  const events = runner.drainEvents();
  controls.defenseLook.observe(events);
  hud.update(state, events, performance.now());
  stageMixer.update(dt);
  controls.placeCamera(camera, avatars.p1.root.position, cameraBlend.fps);
  lookTargets[0].copy(avatars.p1.root.position).setY(1.6);
  lookTargets[1].copy(avatars.p1.root.position).setY(1.0);
  occlusion.update(camera, lookTargets, dt);
  pipeline.render();
}

if (params.has('bench')) {
  await bench();
} else {
  // rAFの時刻は呼び出し前のperformance.now()より古いことがあるため、最初のフレームから測る。
  let last: number | null = null;
  renderer.setAnimationLoop((now) => {
    const deltaMs = now - (last ?? now);
    step(Math.min(deltaMs / 1000, 0.1));
    if (last !== null) stats.frame(deltaMs, now);
    last = now;
  });
}

// 画面更新を待たずに1フレームずつ描画し、GPU完了までの時間を測る。
// 非表示タブでも計測できるが、実表示のフレーム時間（表示同期・合成を含む）の代わりにはならない。
async function bench(): Promise<void> {
  const WARMUP = 60;
  const FRAMES = Number(params.get('bench')) || 300;
  const times: number[] = [];
  for (let i = 0; i < WARMUP + FRAMES; i++) {
    beginFrame(renderer);
    const started = performance.now();
    step(1 / 60);
    await gpuDone(renderer);
    if (i >= WARMUP) times.push(performance.now() - started);
  }
  const result = { ...stats.report(times), mode: 'bench' };
  Object.assign(window, { __corecrushBench: result });
  console.log('bench', result);
}
