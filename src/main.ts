import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Player } from './player';
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
  const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}assets/${name}.glb`);
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

ball.scene.position.set(1.2, 1.2, 4); // 直径約0.22m。M0では表示確認のため浮かせて置く
scene.add(ball.scene);

const height = new THREE.Box3().setFromObject(character.scene).getSize(new THREE.Vector3()).y;
character.scene.scale.setScalar(CHARACTER_HEIGHT / height);
character.scene.position.set(0, 0, 6);
scene.add(character.scene);
const player = new Player(character.scene, character.animations, camera, renderer.domElement);

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
  overlay.hidden = player.locked;
});
document.addEventListener('pointerlockerror', () => {
  startButton.textContent = 'マウスを捕捉できませんでした。もう一度クリック';
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

if (import.meta.env.DEV) Object.assign(window, { __debug: { scene, renderer, character: character.scene, ball: ball.scene, camera, step, gpuDone } });

function step(dt: number): void {
  player.update(dt);
  stageMixer.update(dt);
  ball.scene.rotation.y += dt * 0.6;
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
