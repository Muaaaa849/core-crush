// ローカルプレイヤーの入力を設定の割当どおりにsimコマンドへ変換し、カメラを動かす（feel.md「入力設定」、0013 M3-6）。
// 視点の回転は即座に画面へ反映し、simへは向き（yaw）として渡す。
import * as THREE from 'three/webgpu';
import type { PlayerId, SimState } from '../sim/types';
import type { DistributiveOmit, Input } from './runner';
import { ACTIONS, DEFAULT_SETTINGS, type ActionId, type Settings } from './settings';

const MOUSE_RAD_PER_COUNT = THREE.MathUtils.degToRad(0.022 * 2);
const PITCH_LIMIT = 1.2;
// TPSの肩越し位置（初期案）
const EYE_HEIGHT = 1.6;
const CAMERA_BACK = 2.2;
const CAMERA_RIGHT = 0.5;
const CAMERA_UP = 0.35;

export class Controls {
  yaw = 0; // 0で-z（中央）を向く。P1の初期向き
  private pitch = 0;
  settings: Settings = DEFAULT_SETTINGS;
  /** 論理的なカメラ種別（キャッチ中TPS・投球後硬直中FPSに従う）。感度の選択に使う。 */
  viewMode: 'fps' | 'tps' = 'tps';
  private readonly pressed = new Set<string>(); // 押下中の物理入力（KeyboardEvent.code / 'MouseN'）
  private adsOn = false;
  private sentMove = { x: 0, z: 0 };
  private sentKeys = { forward: 0, right: 0 };
  private sentYaw = NaN;
  private roundStartsAt: number;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly runner: { state: SimState; input(input: Input): void },
    public player: PlayerId,
  ) {
    this.roundStartsAt = runner.state.match.roundStartsAt;
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.alive) return;
      const { sensitivity: s, invertY } = this.settings;
      const scale = MOUSE_RAD_PER_COUNT * s[this.ads ? 'ads' : this.viewMode];
      this.yaw -= e.movementX * scale * s.x;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * scale * s.y * (invertY ? -1 : 1), -PITCH_LIMIT, PITCH_LIMIT);
    });
    document.addEventListener('mousedown', (e) => this.press(`Mouse${e.button}`));
    document.addEventListener('mouseup', (e) => this.release(`Mouse${e.button}`));
    document.addEventListener('contextmenu', (e) => {
      if (this.locked) e.preventDefault();
    });
    document.addEventListener('keydown', (e) => {
      // Ctrl・Alt・Metaを含む入力はブラウザ・OSの操作として戦闘へ流さない。
      if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
      this.press(e.code);
    });
    document.addEventListener('keyup', (e) => this.release(e.code));
    window.addEventListener('blur', () => this.releaseAll());
  }

  enabled = true;

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  get pitchAngle(): number { return this.pitch; }

  /** ADS中か。自分が球を持ち、生存している間だけ。 */
  get ads(): boolean { return this.adsOn && this.holding && this.alive; }

  private get alive(): boolean {
    return this.enabled && (this.runner.state.players.find(p => p.id === this.player)?.hp ?? 0) > 0;
  }

  private get holding(): boolean {
    const ball = this.runner.state.ball;
    return ball.mode === 'held' && ball.owner === this.player;
  }

  private down(action: ActionId): boolean { return this.settings.bindings[action].some(b => b !== null && this.pressed.has(b)); }

  /** 押下の立ち上がりで、その所持状態で有効な行動を1回だけ出す。押しっぱなしで状態が変わっても出さない。 */
  private press(input: string): void {
    if (this.pressed.has(input)) return;
    const holding = this.holding;
    const fired = ACTIONS.filter(a => a.state !== (holding ? 'free' : 'held') && this.settings.bindings[a.id].includes(input) && !this.down(a.id));
    this.pressed.add(input);
    if (!this.locked) return;
    for (const action of fired) this.act(action.id);
  }

  private release(input: string): void {
    this.pressed.delete(input);
    if (this.settings.adsMode === 'hold' && !this.down('ads')) this.adsOn = false;
  }

  /** 押下状態とADSを捨てる（blur・捕捉解除・設定の適用）。次のupdateで移動0を送る。 */
  releaseAll(): void {
    this.pressed.clear(); this.adsOn = false;
  }

  private act(action: ActionId): void {
    if (action === 'ads') { this.adsOn = this.settings.adsMode === 'toggle' ? !this.adsOn : true; return; }
    // 同じ描画フレーム内の方向キー・向きを先に渡し、前フレームの球種にしない。
    this.sendAxes();
    if (action === 'throw') this.send(this.ads ? { kind: 'primary', aim: true } : { kind: 'primary' });
    if (action === 'parry') this.send({ kind: 'primary' });
    if (action === 'catch') this.send({ kind: 'secondary' });
    if (action === 'feint' || action === 'step' || action === 'summon' || action === 'cycle-target') this.send({ kind: action });
    // skill1・skill2は割当だけ。効果はM3-3以降。
  }

  /** 次ラウンド・再戦ではsimの初期yawへ戻し、押下状態を新たに送る（0010）。 */
  sync(): void {
    this.yaw = this.runner.state.players.find(p => p.id === this.player)!.yaw;
    this.roundStartsAt = this.runner.state.match.roundStartsAt;
    this.adsOn = false;
    this.sentYaw = NaN;
    this.sentMove = { x: NaN, z: NaN };
    this.sentKeys = { forward: NaN, right: NaN };
  }

  syncRound(): void {
    if (this.roundStartsAt !== this.runner.state.match.roundStartsAt) this.sync();
  }

  /** 描画フレームごとに、変化した移動入力と向きをsimへ渡す。 */
  update(): void {
    this.syncRound();
    if (!this.holding) this.adsOn = false;
    if (!this.alive) return;
    this.sendAxes();
  }

  private sendAxes(): void {
    if (!this.alive) return;
    const axis = (plus: ActionId, minus: ActionId) => (this.down(plus) ? 1 : 0) - (this.down(minus) ? 1 : 0);
    const forward = axis('forward', 'back');
    const right = axis('right', 'left');
    const move = this.locked
      ? {
          x: -Math.sin(this.yaw) * forward + Math.cos(this.yaw) * right,
          z: -Math.cos(this.yaw) * forward - Math.sin(this.yaw) * right,
        }
      : { x: 0, z: 0 };
    const magnitude = Math.max(1, Math.hypot(move.x, move.z));
    move.x /= magnitude; move.z /= magnitude;
    // 球種はキーの意図で決まる（移動方向はカメラの向きで回転するため使えない）。
    const keys = this.locked ? { forward, right } : { forward: 0, right: 0 };
    if (keys.forward !== this.sentKeys.forward || keys.right !== this.sentKeys.right) {
      this.sentKeys = keys;
      this.send({ kind: 'keys', ...keys });
    }
    if (move.x !== this.sentMove.x || move.z !== this.sentMove.z) {
      this.sentMove = move;
      this.send({ kind: 'move', ...move });
    }
    if (this.yaw !== this.sentYaw) {
      this.sentYaw = this.yaw;
      this.send({ kind: 'yaw', yaw: this.yaw });
    }
  }

  /** 表示上のキャラ位置に合わせてカメラを置く。fps は0（TPSの肩越し）〜1（目の位置）。向きは変えない。 */
  placeCamera(camera: THREE.PerspectiveCamera, body: THREE.Vector3, fps: number, yaw = this.yaw, pitch = this.pitch): void {
    const look = new THREE.Vector3(
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    camera.position
      .copy(body)
      .add(new THREE.Vector3(0, EYE_HEIGHT + CAMERA_UP, 0))
      .addScaledVector(right, CAMERA_RIGHT * (1 - fps))
      .addScaledVector(look, -CAMERA_BACK * (1 - fps));
    camera.position.y -= CAMERA_UP * fps;
    camera.lookAt(camera.position.clone().add(look));
  }

  private send(input: DistributiveOmit<Input, 'player'>): void {
    if (!this.alive) return;
    this.runner.input({ ...input, player: this.player });
  }
}
