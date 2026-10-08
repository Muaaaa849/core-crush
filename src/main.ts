import * as THREE from 'three/webgpu';
import { mix, pass, texture, uniform, vec3 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { addMarkers, Avatar } from './game/avatar';
import { CHARACTERS, playerLabel, TEAM_COLORS, type CharacterId, type Roster } from './game/characters';
import { rollRotation } from './game/ballview';
import { Bot } from './game/bot';
import { CameraBlend, cameraPlayerFor, heldFpsPose } from './game/camera';
import { aimLine } from './sim/aim';
import { Controls } from './game/controls';
import { bindingLabel, loadSettings, type Settings } from './game/settings';
import { effectiveVolume, hitEdgeOpacity, reticleStyle, scaleShake, settingsStorage, SettingsView, viewFov } from './game/settingsview';
import { coreFace, type CoreFace } from './game/coreface';
import { createAudioOutput } from './game/audio';
import { HitStop } from './game/hitstop';
import { Hud, REMATCH_SECONDS } from './game/hud';
import { localRoster, rosterMatch } from './game/match';
import { createPresentation, updatePresentation } from './game/presentation';
import { SimRunner } from './game/runner';
import { describeSound, warningSound } from './game/sound';
import { addEffects, effectsFor, judgement, liveEffects, type Effect } from './game/vfx';
import { VfxView } from './game/vfxview';
import { TargetView } from './game/targetview';
import { SkillMarkers } from './game/skillmarkers';
import { overchargeVisible, playerDisplayPosition } from './game/skillview';
import { CameraOcclusion } from './occlusion';
import { defaultConfig as config } from './sim/config';
import { createInitialState } from './sim/sim';
import type { MatchMode, PlayerId, SimState, Vec3 } from './sim/types';
import { beginFrame, gpuDone, gpuName } from './gpu';
import { StatsOverlay } from './stats';
import { RoomConnection, roomUrl } from './net/room';
import type { OnlineMatch } from './net/online';
import type { Input } from './game/runner';
import { Screens } from './ui/screens';
import { characterCards, renderLocalRoster, renderRoomRoster } from './ui/roster';
import './style.css';

const CHARACTER_HEIGHT = 1.8; // m。モデルの寸法ではなくゲーム側の基準で決める
const params = new URLSearchParams(location.search);
const loadedSettings = loadSettings(settingsStorage());
let settings = loadedSettings.settings;
const settingsMessage = document.querySelector<HTMLElement>('#settings-message')!;
settingsMessage.textContent = loadedSettings.message;

const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: params.get('backend') === 'webgl' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.AgXToneMapping;
document.body.append(renderer.domElement);
await renderer.init();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060b);
const camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.05, 500);

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

const faceLoader = new THREE.TextureLoader();
const faceNames = { calm: 'lcd_0_calm_mask', panic: 'lcd_1_panic_mask', rage: 'lcd_2_rage_mask' };
const faceMasks = Object.fromEntries(await Promise.all(Object.entries(faceNames).map(async ([expression, name]) => {
  const mask = await faceLoader.loadAsync(`${import.meta.env.BASE_URL}assets/${name}.webp?v=${__ASSET_VERSIONS__[name]}`);
  mask.flipY = false;
  mask.minFilter = mask.magFilter = THREE.NearestFilter;
  mask.generateMipmaps = false;
  return [expression, mask];
}))) as Record<CoreFace['expression'], THREE.Texture>;
const faceColors = {
  calm: new THREE.Color().setRGB(0, 0.78, 1),
  panic: new THREE.Color().setRGB(1, 0.5, 0),
  rage: new THREE.Color().setRGB(1, 0.05, 0.03),
};
const faceMask = texture(faceMasks.calm);
const faceColor = uniform(faceColors.calm.clone());
const faceCracked = uniform(0);
// 原本マスクのRは顔、Gは亀裂。色付き背景と白い亀裂を液晶の発光へ合成する。
ball.scene.traverse((o) => {
  if (!(o instanceof THREE.Mesh)) return;
  const material = o.material as THREE.MeshStandardMaterial;
  if (material.name !== 'M_LCD') return;
  const lcd = new THREE.MeshStandardNodeMaterial({
    name: material.name, color: material.color, roughness: material.roughness,
    metalness: material.metalness, side: material.side,
  });
  lcd.emissiveNode = mix(faceColor.mul(faceMask.r.mul(0.92).add(0.08)), vec3(1), faceMask.g.mul(faceCracked))
    .mul(material.emissiveIntensity);
  o.material = lcd;
  material.dispose();
});
let shownFace: CoreFace = { expression: 'calm', cracked: false };
function updateCoreFace(state: SimState): void {
  const elapsed = started && state.match.phase === 'play' && state.now >= state.match.roundStartsAt
    && state.ball.mode !== 'absent' && state.danger
    ? config.dangerDuration - (state.danger.expiresAt - state.now) : null;
  const face = coreFace(elapsed, config.timeUnitsPerSecond);
  if (face.expression !== shownFace.expression) {
    faceMask.value = faceMasks[face.expression];
    faceColor.value.copy(faceColors[face.expression]);
  }
  if (face.cracked !== shownFace.cracked) faceCracked.value = face.cracked ? 1 : 0;
  shownFace = face;
}

const height = new THREE.Box3().setFromObject(character.scene).getSize(new THREE.Vector3()).y;
character.scene.scale.setScalar(CHARACTER_HEIGHT / height);
let mode: MatchMode = '1v1';
const bots: Bot[] = [];
// 自分のキャラ（0013）。開始画面の4択から選び、Botは参加枠固定。
const characterPicker = document.querySelector<HTMLFieldSetElement>('#character')!;
const rosterPreview = document.querySelector<HTMLElement>('#roster-preview')!;
characterPicker.append(...characterCards());
const selectedCharacter = () => document.querySelector<HTMLInputElement>('input[name="character"]:checked')!.value as CharacterId;
let localRosterValue: Roster = localRoster(mode, selectedCharacter());
const currentRoster = (): Roster => onlineMatch?.session.roster ?? localRosterValue;
function newMatch() {
  localRosterValue = localRoster(mode, selectedCharacter());
  return createInitialState(rosterMatch(localRosterValue, Math.random() < 0.5 ? 'a' : 'b'), config);
}
function previewRoster(): void {
  const selected = document.querySelector<HTMLInputElement>('input[name="mode"]:checked')!.value as MatchMode;
  const roster = localRoster(selected, selectedCharacter());
  renderLocalRoster(rosterPreview, roster);
  document.querySelector('#online-character-name')!.textContent = CHARACTERS[selectedCharacter()].name;
}
const runner = new SimRunner(newMatch(), config, bots);
// ローカルの確定イベントは試合ごとに連番を振り、再戦で演出の消費位置を初期化する（0012）。
let localMatchNumber = 0, localSeq = 0;
function restartLocal(state: SimState): void {
  runner.restart(state); localMatchNumber++; localSeq = 0;
}
let onlineMatch: OnlineMatch | undefined;
let connection: RoomConnection | undefined;
let localPlayer: PlayerId = 'p1';
const game = {
  get state() { return onlineMatch?.state ?? runner.state; },
  get previous() { return onlineMatch?.previous ?? runner.previous; },
  get alpha() { return onlineMatch?.alpha ?? runner.alpha; },
  input(input: Input) { if (onlineMatch) onlineMatch.input(input); else runner.input(input); },
};
const avatars = new Map<PlayerId, Avatar>();
const avatarMarkers = new Map<PlayerId, ReturnType<typeof addMarkers>>();
function createAvatars(): void {
  for (const avatar of avatars.values()) scene.remove(avatar.root);
  avatars.clear();
  avatarMarkers.clear();
  const roster = currentRoster();
  for (const player of game.state.players) {
    const model = cloneSkinned(character.scene);
    const entry = roster.find(e => e.id === player.id)!;
    avatarMarkers.set(player.id, addMarkers(model, playerLabel(roster, localPlayer, player.id), TEAM_COLORS[entry.side], CHARACTERS[entry.characterId].colors, player.id !== localPlayer));
    scene.add(model); avatars.set(player.id, new Avatar(model, character.animations));
  }
}
createAvatars();
// 既存のベンチは開始画面を経由せず1v1を進める。通常の試遊は開始操作を待つ。
bots.push(...runner.state.players.filter(p => p.id !== 'p1').map(p => new Bot(p.id)));
let started = params.has('bench');
const modeSelector = document.querySelector<HTMLFieldSetElement>('#match-mode')!;
let rematchAt: number | null = null; // 試合終了後、表示時刻でこの時刻に再戦（0008）
const controls = new Controls(renderer.domElement, game, localPlayer);
const hudElement = document.querySelector<HTMLElement>('#hud')!;
let hud = new Hud(hudElement, config, localPlayer, currentRoster());
const targets = new TargetView(scene);
const skillMarkers = new SkillMarkers(scene, config);
const occlusion = new CameraOcclusion(stage.scene);
const cameraBlend = new CameraBlend();
const hitStop = new HitStop();
const audio = createAudioOutput();
let presentation = createPresentation('local:0');
let presentedRevision = 0; // OnlineMatchが履歴を捨てた回数。変わったら過去分を鳴らさない
const audioStatus = document.querySelector<HTMLElement>('#audio-status')!;
const reticle = document.querySelector<HTMLElement>('#reticle')!;
function applySettings(value: Settings): void {
  controls.releaseAll(); settings = value; controls.settings = settings;
  audio.setVolume(settings.effects.volume, settings.effects.muted);
  for (const [property, css] of Object.entries(reticleStyle(settings.reticle))) reticle.style.setProperty(property, css);
}
applySettings(settings);
const settingsView = new SettingsView(document.querySelector<HTMLDetailsElement>('#settings')!,
  () => settings, applySettings, settingsStorage, () => controls.releaseAll(), settingsMessage);
async function startAudio(): Promise<void> {
  await audio.start();
  audioStatus.textContent = audio.status;
}
document.addEventListener('visibilitychange', () => { if (document.hidden) audio.stop(); });
const vfx = new VfxView(scene, config.ballDiameter / 2);
let shownEffects: Effect[] = [];
// 判定文字はレティクル下の固定枠に450ms。本人の結果を優先し、同じ優先度なら最新で置き換える（0012）。
const JUDGEMENT_MS = 450, HIT_EDGE_MS = 120;
const judgementElement = document.querySelector<HTMLElement>('#judgement')!;
const hitEdge = document.querySelector<HTMLElement>('#hit-edge')!;
let shownJudgement = { text: '', self: false, until: 0 };
let hitEdgeAt = -Infinity;
const lookTargets = [new THREE.Vector3(), new THREE.Vector3()]; // キャラの頭と胸

/** 直前と最新のsim状態の間を補間した足元の位置。 */
function playerPosition(id: PlayerId, out: THREE.Vector3): THREE.Vector3 {
  const position = playerDisplayPosition(game.previous, game.state, id, game.alpha);
  return out.set(position.x, 0, position.z);
}

// TPS保持球はキャラ基準、FPSはカメラ基準で右下へ。表示位置・寸法はsimの射線へ使わない。
const HELD = { forward: 0.45, right: 0, height: 1.2 };
let lastBall: { mode: SimState['ball']['mode']; position: Vec3 } = { mode: 'absent', position: { x: 0, y: 0, z: 0 } };
const rollQuaternion = new THREE.Quaternion();
function placeBall(state: SimState): void {
  const b = state.ball;
  ball.scene.visible = started && b.mode !== 'absent';
  ball.scene.scale.setScalar(config.ballDiameter / BALL_MODEL_DIAMETER);
  if (b.mode === 'held') {
    const holder = state.players.find((p) => p.id === b.owner)!;
    const at = playerPosition(holder.id, new THREE.Vector3());
    const yaw = holder.id === localPlayer ? controls.yaw : holder.yaw;
    const t = holder.id === localPlayer ? cameraBlend.fps : 0;
    ball.scene.position.set(
      at.x - Math.sin(yaw) * HELD.forward + Math.cos(yaw) * HELD.right,
      at.y + HELD.height,
      at.z - Math.cos(yaw) * HELD.forward - Math.sin(yaw) * HELD.right,
    );
    if (t > 0) {
      const fps = heldFpsPose(camera.fov, camera.aspect, config.ballDiameter / 2);
      const position = new THREE.Vector3(fps.position.x, fps.position.y, fps.position.z)
        .applyQuaternion(camera.quaternion).add(camera.position);
      ball.scene.position.lerp(position, t);
      ball.scene.scale.multiplyScalar(THREE.MathUtils.lerp(1, fps.scale, t));
    }
  } else if (b.mode === 'loose' || b.mode === 'flight') {
    // simの確定位置（落球は1Fごと）の間を補間する。状態が切り替わった直後は最新位置へ。
    const a = game.previous.ball;
    const from = a.mode === b.mode && game.previous.match.roundStartsAt === state.match.roundStartsAt ? a.position : b.position;
    const shown = { x: THREE.MathUtils.lerp(from.x, b.position.x, game.alpha),
      y: THREE.MathUtils.lerp(from.y, b.position.y, game.alpha), z: THREE.MathUtils.lerp(from.z, b.position.z, game.alpha) };
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

const onlineEntry = document.querySelector<HTMLElement>('#online-entry')!;
const onlineLobby = document.querySelector<HTMLElement>('#online-lobby')!;
const onlineStatus = document.querySelector<HTMLElement>('#online-status')!;
const networkStatus = document.querySelector<HTMLElement>('#network-status')!;
const roster = document.querySelector<HTMLElement>('#room-roster')!;
const roomProgress = document.querySelector<HTMLElement>('#room-progress')!;
const beginButton = document.querySelector<HTMLButtonElement>('#room-begin')!;
const confirmButton = document.querySelector<HTMLButtonElement>('#room-confirm')!;
const createButton = document.querySelector<HTMLButtonElement>('#room-create')!;
const joinForm = document.querySelector<HTMLFormElement>('#room-join')!;
const screens = new Screens(overlay, () => settingsView.close(), () => controls.releaseAll());
let roomOrigin: string | undefined;
try { roomOrigin = roomUrl(import.meta.env.VITE_ROOM_URL); }
catch (error) { onlineStatus.textContent = (error as Error).message; }
if (roomOrigin) { onlineEntry.hidden = started; onlineStatus.textContent = '身内の招待制。直接接続では相手にIPが伝わります'; }
else if (!import.meta.env.VITE_ROOM_URL) onlineStatus.textContent = 'オンラインは未設定';

function returnToLobby(): void {
  networkStatus.hidden = true;
  started = false; onlineMatch = undefined; rematchAt = null; controls.enabled = false;
  document.exitPointerLock(); showMenu();
  localPlayer = 'p1'; controls.player = localPlayer;
  localRosterValue = localRoster(connection?.view?.mode ?? mode, selectedCharacter());
  restartLocal(createInitialState(rosterMatch(localRosterValue, 'a'), config));
  createAvatars(); controls.sync(); hud = new Hud(hudElement, config, localPlayer, currentRoster());
  confirmButton.hidden = true; startButton.hidden = true;
  cameraBlend.mode = 'tps'; cameraBlend.fps = 0; lastBall.mode = 'absent';
}
function leaveRoom(): void {
  connection?.close(); connection = undefined; returnToLobby();
  onlineLobby.hidden = true; onlineEntry.hidden = !roomOrigin;
  modeSelector.disabled = false; characterPicker.disabled = false; startButton.hidden = false; controls.enabled = true;
  screens.show('online');
  startButton.textContent = 'ローカル試遊を開始';
}
async function enterRoom(selected?: MatchMode, code?: string): Promise<void> {
  const characterId = selectedCharacter();
  if (!roomOrigin || connection || started) return;
  createButton.disabled = true;
  const joinButton = joinForm.querySelector<HTMLButtonElement>('button')!; joinButton.disabled = true;
  const next = new RoomConnection(roomOrigin, __BUILD_ID__, {
    status: text => { onlineStatus.textContent = text; },
    view: (room, invite, player) => {
      const entering = onlineLobby.hidden;
      onlineEntry.hidden = true; onlineLobby.hidden = false; modeSelector.disabled = true;
      document.querySelector<HTMLInputElement>('#room-code')!.value = invite;
      if (entering) { screens.show('online'); onlineStatus.textContent = '部屋に接続しました'; }
      document.querySelector('#lobby-heading')!.textContent = `ロビー ${room.mode} / ${room.players.length}人`;
      renderRoomRoster(roster, room.players, player);
      characterPicker.disabled = room.phase !== 'lobby';
      beginButton.hidden = player !== 'p1' || room.phase !== 'lobby';
      beginButton.disabled = room.players.length !== (room.mode === '2v2' ? 4 : room.mode === '1v2' ? 3 : 2);
      roomProgress.textContent = room.phase === 'lobby' ? '参加者がそろったらホストが開始します' : room.phase === 'connecting' ? '接続とロードを確認中（20秒以内）' : '全員ロード完了';
    },
    preparing: match => {
      onlineMatch = match; presentedRevision = match.presentationRevision; localPlayer = match.player; controls.player = localPlayer;
      controls.enabled = false; controls.sync(); started = false; rematchAt = null;
      bots.length = 0; createAvatars(); hud = new Hud(hudElement, config, localPlayer, currentRoster(), true);
      startButton.hidden = true; document.exitPointerLock(); showMenu();
    },
    lobby: returnToLobby,
    disconnected: leaveRoom,
  }, params.get('relay') === '1');
  connection = next; controls.enabled = false; startButton.hidden = true;
  onlineStatus.textContent = '部屋に接続中…';
  try { await next.enter(selected, characterId, code); }
  catch (error) { leaveRoom(); onlineStatus.textContent = `参加できません：${(error as Error).message}`; }
  finally { createButton.disabled = false; joinButton.disabled = false; }
}
// 部屋ではロビーの間だけキャラを申告し直せる。開始後は部屋が拒否する。
characterPicker.addEventListener('change', () => {
  previewRoster();
  if (connection?.view?.phase === 'lobby') {
    try { connection.select(selectedCharacter()); } catch (error) { onlineStatus.textContent = (error as Error).message; }
  }
});
modeSelector.addEventListener('change', previewRoster);
previewRoster();
createButton.addEventListener('click', () => { void enterRoom(document.querySelector<HTMLSelectElement>('#online-mode')!.value as MatchMode); });
joinForm.addEventListener('submit', e => { e.preventDefault(); void enterRoom(undefined, document.querySelector<HTMLInputElement>('#invite-code')!.value.trim().toLowerCase()); });
beginButton.addEventListener('click', () => { try { connection?.begin(); } catch (error) { onlineStatus.textContent = (error as Error).message; } });
confirmButton.addEventListener('click', () => {
  try { connection?.confirm(); confirmButton.disabled = true; roomProgress.textContent = '全員の結果確認を待っています'; }
  catch (error) { onlineStatus.textContent = (error as Error).message; }
});
document.querySelector('#room-leave')!.addEventListener('click', leaveRoom);
addEventListener('pagehide', () => connection?.close(false));
if (roomOrigin) {
  const saved = RoomConnection.savedCode(roomOrigin, __BUILD_ID__);
  if (saved) void enterRoom(undefined, saved);
}

startButton.textContent = 'プレイ開始';
startButton.disabled = false;
const POINTER_LOCK_ERROR = 'マウスを捕捉できませんでした。開始／再開をもう一度クリックしてください';
startButton.addEventListener('click', () => {
  if (connection && !connection.playing) return;
  if (settingsMessage.textContent === POINTER_LOCK_ERROR) settingsMessage.textContent = '';
  settingsView.close(); controls.releaseAll();
  void startAudio();
  if (!started) {
    mode = document.querySelector<HTMLInputElement>('input[name="mode"]:checked')!.value as MatchMode;
    restartLocal(newMatch());
    bots.length = 0;
    bots.push(...runner.state.players.filter(p => p.id !== 'p1').map(p => new Bot(p.id)));
    createAvatars(); controls.sync(); hud = new Hud(hudElement, config, localPlayer, currentRoster());
    started = true; modeSelector.disabled = true; characterPicker.disabled = true;
    onlineEntry.hidden = true;
  }
  showMenu();
  const canvas = renderer.domElement;
  // 生入力（OSのマウス加速なし）に非対応の環境では通常の捕捉にする。失敗はpointerlockerrorで案内する。
  canvas.requestPointerLock({ unadjustedMovement: true }).catch(() => canvas.requestPointerLock().catch(() => {}));
});
document.addEventListener('pointerlockchange', () => {
  controls.releaseAll();
  if (controls.locked && started) overlay.hidden = true;
  else showMenu();
});
function showMenu(): void {
  screens.show(connection && (!started || onlineMatch?.finished || onlineMatch?.status === 'invalid') ? 'online' : started ? 'pause' : 'menu');
  startButton.textContent = started ? (onlineMatch ? '操作する' : '再開') : 'プレイ開始';
}
document.addEventListener('pointerlockerror', () => {
  settingsMessage.textContent = POINTER_LOCK_ERROR;
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

if (import.meta.env.DEV) Object.assign(window, { __debug: { scene, renderer, runner, camera, step, gpuDone, get onlineMatch() { return onlineMatch; } } });

const tmp = new THREE.Vector3();
/** 被弾硬直の残り（1→0）。被弾クリップができるまでの仮の姿勢に使う（0009）。 */
function hitstun(state: SimState, id: PlayerId): number {
  const action = state.players.find((p) => p.id === id)!.action;
  return action?.kind === 'hitstun' ? Math.max(0, (action.endsAt - state.now) / (action.endsAt - action.startedAt)) : 0;
}
function step(dt: number): void {
  const now = performance.now();
  if (onlineMatch && connection) {
    connection.poll();
    const countdown = connection.countdown;
    if (countdown !== undefined && !started) roomProgress.textContent = countdown ? `開始まで ${countdown} 秒` : '「操作する」をクリックしてマウスを捕捉';
    if (connection.playing && !started) {
      started = true; controls.enabled = true; controls.sync(); startButton.hidden = false; startButton.textContent = '操作する';
    }
  }
  if (started) {
    controls.update();
    if (!onlineMatch) runner.advance(dt * 1000);
  }
  const drained = onlineMatch?.drainEvents() ?? runner.drainEvents().map(event => ({ seq: ++localSeq, event }));
  let historyThrough: number | undefined;
  if (onlineMatch && onlineMatch.presentationRevision !== presentedRevision) {
    presentedRevision = onlineMatch.presentationRevision; historyThrough = onlineMatch.presentationHistoryThrough;
    hud.clearSkillNotices();
  }
  // 確定した結果だけを、表示中の時刻に達した最初の描画で一度だけ提示する（0012）。
  const shownResults = updatePresentation(presentation, {
    matchId: onlineMatch?.session.matchId ?? `local:${localMatchNumber}`, events: drained,
    state: game.state, confirmed: onlineMatch?.confirmed,
    viewSimAt: game.previous.now + game.alpha * (game.state.now - game.previous.now), displayNowMs: now,
    visible: !document.hidden, running: onlineMatch ? onlineMatch.status === 'running' : started,
    audioReady: audio.ready, muted: effectiveVolume(settings.effects) === 0, historyThrough, config,
  });
  presentation = shownResults.state;
  const events = shownResults.events;
  if (onlineMatch) {
    networkStatus.hidden = onlineMatch.status === 'running';
    networkStatus.textContent = onlineMatch.status === 'invalid' ? '無効試合'
      : `通信が途切れました…再接続を待っています（残り${onlineMatch.remainingSeconds}秒）`;
    if (onlineMatch.status === 'invalid') {
      controls.enabled = false; document.exitPointerLock(); showMenu();
      startButton.hidden = true; roomProgress.textContent = '無効試合。部屋を退出してください';
    }
  }
  if (onlineMatch?.finished && confirmButton.hidden) {
    controls.enabled = false; document.exitPointerLock(); showMenu();
    confirmButton.hidden = false; confirmButton.disabled = false; startButton.hidden = true;
    const local = onlineMatch.confirmed.players.find(p => p.id === localPlayer)!;
    const result = onlineMatch.client.events.find(e => e.event.kind === 'match-end')!.event;
    roomProgress.textContent = `試合終了：${result.kind === 'match-end' && result.winner === local.side ? 'あなたの勝ち' : 'あなたの負け'}。結果を確認してください`;
  }
  if (!connection && events.some((e) => e.kind === 'match-end')) rematchAt = now + REMATCH_SECONDS * 1000;
  if (rematchAt !== null && now >= rematchAt) {
    rematchAt = null;
    restartLocal(newMatch()); controls.sync();
    cameraBlend.mode = 'tps'; cameraBlend.fps = 0;
    lastBall.mode = 'absent';
  }
  controls.syncRound();
  const state = game.state;
  if (events.some(e => e.kind === 'spawn')) lastBall.mode = 'absent';
  hitStop.trigger(shownResults.effects.map(e => e.event), now);
  for (const { event, startedAtMs } of shownResults.effects) {
    shownEffects = addEffects(liveEffects(shownEffects, now), effectsFor(event, startedAtMs, settings.effects.flash > 0));
    const text = judgement(event, localPlayer, game.state.players);
    if (text && (text.self || !shownJudgement.self || now >= shownJudgement.until)) shownJudgement = { ...text, until: now + JUDGEMENT_MS };
    if (event.kind === 'hit' && event.player === localPlayer && settings.effects.flash > 0) hitEdgeAt = now;
  }
  judgementElement.textContent = now < shownJudgement.until ? shownJudgement.text : '';
  hitEdge.style.opacity = String(hitEdgeOpacity(now - hitEdgeAt, HIT_EDGE_MS, settings.effects.flash));
  const shown = dt * hitStop.timeScale(now); // ヒットストップ中は見た目の動きだけ止める
  cameraBlend.update(state, localPlayer, dt * 1000);
  controls.viewMode = cameraBlend.mode;
  const fov = viewFov(settings.fov, controls.ads);
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  for (const player of state.players) {
    const yaw = player.id === localPlayer && player.hp > 0 ? controls.yaw : player.yaw;
    const avatar = avatars.get(player.id)!;
    avatar.update(playerPosition(player.id, tmp), yaw, dt, shown, hitstun(state, player.id));
    avatarMarkers.get(player.id)!.update(overchargeVisible(player, state.now), settings.effects.flash);
    avatar.root.visible = player.hp > 0 && (player.id !== localPlayer || cameraBlend.fps < 0.5);
  }
  const viewing = cameraPlayerFor(state, localPlayer);
  const displayed = state.players.map(player => ({ ...player, position: playerPosition(player.id, new THREE.Vector3()) }));
  const viewed = displayed.find(player => player.id === viewing)!;
  const body = viewed.position;
  const yaw = viewing === localPlayer ? controls.yaw : viewed.yaw;
  const pitch = viewing === localPlayer ? controls.pitchAngle : 0; // KO後の味方観戦は従来の水平TPS。
  const aim = aimLine({ ...viewed, yaw, pitch }, displayed, config);
  controls.placeCamera(camera, body, viewing === localPlayer ? cameraBlend.fps : 0, aim.target, config, yaw, pitch);
  placeBall(state);
  updateCoreFace(state);
  if (state.ball.mode !== 'loose') ball.scene.rotation.y += shown * 0.6;
  hud.skillKeys = [bindingLabel(settings.bindings.skill1), bindingLabel(settings.bindings.skill2)];
  hud.skillYaw = controls.yaw;
  hud.update(onlineMatch?.finished ? onlineMatch.confirmed : state, events, now);
  targets.update(state, localPlayer, id => playerPosition(id, new THREE.Vector3()));
  stageMixer.update(dt);
  skillMarkers.update(state, localPlayer, controls.yaw,
    started && overlay.hidden && controls.enabled && !document.hidden && (!onlineMatch || onlineMatch.status === 'running'),
    ball.scene.visible, ball.scene.position, camera);
  // 音の定位は揺れを混ぜない論理カメラから求める。
  const listener = { player: localPlayer, players: state.players, position: camera.position.clone(),
    right: new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), rallySpeedCap: config.rallySpeedCap };
  vfx.update(shownEffects, now, camera, settings.effects.flash);
  for (const e of shownResults.sounds) {
    const plan = describeSound(e, listener);
    if (plan) audio.play(plan);
  }
  const localSide = state.players.find(p => p.id === localPlayer)!.side;
  for (const w of shownResults.warnings) audio.play(warningSound(w.side, localSide));
  const shake = scaleShake(hitStop.shake(now), settings.effects.shake);
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
