import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Avatar } from './game/avatar';
import { rollRotation } from './game/ballview';
import { Bot } from './game/bot';
import { CameraBlend, cameraPlayerFor } from './game/camera';
import { Controls } from './game/controls';
import { HitStop } from './game/hitstop';
import { Hud, REMATCH_SECONDS } from './game/hud';
import { localMatch } from './game/match';
import { SimRunner } from './game/runner';
import { TargetView } from './game/targetview';
import { CameraOcclusion } from './occlusion';
import { defaultConfig as config } from './sim/config';
import { createInitialState } from './sim/sim';
import type { MatchMode, PlayerId, SimState, Vec3 } from './sim/types';
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
let mode: MatchMode = '1v1';
const bots: Bot[] = [];
const newMatch = () => createInitialState(localMatch(mode, Math.random() < 0.5 ? 'a' : 'b'), config);
const runner = new SimRunner(newMatch(), config, bots);
const avatars = new Map<PlayerId, Avatar>();
function createAvatars(): void {
  for (const avatar of avatars.values()) scene.remove(avatar.root);
  avatars.clear();
  for (const player of runner.state.players) {
    const model = cloneSkinned(character.scene);
    scene.add(model); avatars.set(player.id, new Avatar(model, character.animations));
  }
}
createAvatars();
// 既存のベンチは開始画面を経由せず1v1を進める。通常の試遊は開始操作を待つ。
bots.push(...runner.state.players.filter(p => p.id !== 'p1').map(p => new Bot(p.id)));
let started = params.has('bench');
const modeSelector = document.querySelector<HTMLFieldSetElement>('#match-mode')!;
let rematchAt: number | null = null; // 試合終了後、表示時刻でこの時刻に再戦（0008）
const controls = new Controls(renderer.domElement, runner, 'p1');
const hud = new Hud(document.querySelector<HTMLElement>('#hud')!, config, 'p1');
const targets = new TargetView(scene);
const occlusion = new CameraOcclusion(stage.scene);
const cameraBlend = new CameraBlend();
const hitStop = new HitStop();
const lookTargets = [new THREE.Vector3(), new THREE.Vector3()]; // キャラの頭と胸

/** 直前と最新のsim状態の間を補間した足元の位置。 */
function playerPosition(id: PlayerId, out: THREE.Vector3): THREE.Vector3 {
  const a = runner.previous.players.find(p => p.id === id)!.position;
  const b = runner.state.players.find(p => p.id === id)!.position;
  if (runner.previous.match.roundStartsAt !== runner.state.match.roundStartsAt) return out.set(b.x, 0, b.z);
  return out.set(a.x, 0, a.z).lerp(new THREE.Vector3(b.x, 0, b.z), runner.alpha);
}

// 保持中の球の表示位置（キャラの向き基準）。FPSでは画面右下へ寄せ、正面の視界を空ける（feel.md）。
const HELD = { forward: 0.45, right: 0, height: 1.2 };
const HELD_FPS = { forward: 1.1, right: 0.6, height: 0.95 };
let lastBall: { mode: SimState['ball']['mode']; position: Vec3 } = { mode: 'absent', position: { x: 0, y: 0, z: 0 } };
const rollQuaternion = new THREE.Quaternion();
function placeBall(state: SimState): void {
  const b = state.ball;
  ball.scene.visible = started && b.mode !== 'absent';
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
    // simの確定位置（落球は1Fごと）の間を補間する。状態が切り替わった直後は最新位置へ。
    const a = runner.previous.ball;
    const from = a.mode === b.mode && runner.previous.match.roundStartsAt === state.match.roundStartsAt ? a.position : b.position;
    const shown = { x: THREE.MathUtils.lerp(from.x, b.position.x, runner.alpha),
      y: THREE.MathUtils.lerp(from.y, b.position.y, runner.alpha), z: THREE.MathUtils.lerp(from.z, b.position.z, runner.alpha) };
    // 床を転がる分だけ球を回す（0009）。保持・飛行から切り替わった瞬間の移動は数えない。
    const roll = b.mode === 'loose' && lastBall.mode === 'loose' ? rollRotation(lastBall.position, shown, config.ballDiameter / 2) : null;
    if (roll) ball.scene.quaternion.premultiply(rollQuaternion.setFromAxisAngle(tmp.set(roll.axis.x, roll.axis.y, roll.axis.z), roll.angle));
    ball.scene.position.set(shown.x, shown.y, shown.z);
    lastBall = { mode: b.mode, position: shown };
    return;
  }
  lastBall = { mode: b.mode, position: { x: 0, y: 0, z: 0 } };
}

const scenePass = pass(scene, camera);
const color = scenePass.getTextureNode('output');
const pipeline = new THREE.RenderPipeline(renderer, color.add(bloom(color, 0.6, 0.2, 0.9)));

startButton.textContent = 'プレイ開始';
startButton.disabled = false;
startButton.addEventListener('click', () => {
  if (!started) {
    mode = document.querySelector<HTMLInputElement>('input[name="mode"]:checked')!.value as MatchMode;
    runner.restart(newMatch());
    bots.length = 0;
    bots.push(...runner.state.players.filter(p => p.id !== 'p1').map(p => new Bot(p.id)));
    createAvatars(); controls.sync();
    started = true; modeSelector.disabled = true;
  }
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
/** 被弾硬直の残り（1→0）。被弾クリップができるまでの仮の姿勢に使う（0009）。 */
function hitstun(state: SimState, id: PlayerId): number {
  const action = state.players.find((p) => p.id === id)!.action;
  return action?.kind === 'hitstun' ? Math.max(0, (action.endsAt - state.now) / (action.endsAt - action.startedAt)) : 0;
}
function step(dt: number): void {
  const now = performance.now();
  if (started) {
    controls.update(); runner.advance(dt * 1000);
  }
  const events = runner.drainEvents();
  if (events.some((e) => e.kind === 'match-end')) rematchAt = now + REMATCH_SECONDS * 1000;
  if (rematchAt !== null && now >= rematchAt) {
    rematchAt = null;
    runner.restart(newMatch()); controls.sync();
    cameraBlend.mode = 'tps'; cameraBlend.fps = 0;
    lastBall.mode = 'absent';
  }
  controls.syncRound();
  const state = runner.state;
  if (events.some(e => e.kind === 'spawn')) lastBall.mode = 'absent';
  hitStop.trigger(events, now);
  const shown = dt * hitStop.timeScale(now); // ヒットストップ中は見た目の動きだけ止める
  cameraBlend.update(state, 'p1', dt * 1000);
  for (const player of state.players) {
    const yaw = player.id === 'p1' && player.hp > 0 ? controls.yaw : player.yaw;
    const avatar = avatars.get(player.id)!;
    avatar.update(playerPosition(player.id, tmp), yaw, dt, shown, hitstun(state, player.id));
    avatar.root.visible = player.hp > 0 && (player.id !== 'p1' || cameraBlend.fps < 0.5);
  }
  placeBall(state);
  if (state.ball.mode !== 'loose') ball.scene.rotation.y += shown * 0.6;
  hud.update(runner.state, events, now);
  targets.update(state, 'p1', id => playerPosition(id, new THREE.Vector3()));
  stageMixer.update(dt);
  const viewing = cameraPlayerFor(runner.state, 'p1');
  const body = playerPosition(viewing, new THREE.Vector3());
  if (viewing === 'p1') controls.placeCamera(camera, body, cameraBlend.fps);
  else controls.placeCamera(camera, body, 0, runner.state.players.find(p => p.id === viewing)!.yaw, 0);
  const shake = hitStop.shake(now);
  camera.position.add(tmp.set(shake.x, shake.y, 0).applyQuaternion(camera.quaternion));
  lookTargets[0].copy(body).setY(1.6);
  lookTargets[1].copy(body).setY(1.0);
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
