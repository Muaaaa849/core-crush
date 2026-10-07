// ローカルプレイヤーの入力をsimコマンドへ変換し、カメラを動かす（feel.md「入力設定」「カメラ」）。
// 視点の回転は即座に画面へ反映し、simへは向き（yaw）として渡す。
import * as THREE from 'three/webgpu';
import type { PlayerId } from '../sim/types';
import type { DistributiveOmit, Input, SimRunner } from './runner';

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
  private readonly keys = new Set<string>();
  private sentMove = { x: 0, z: 0 };
  private sentKeys = { forward: 0, right: 0 };
  private sentYaw = NaN;
  private roundStartsAt: number;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly runner: SimRunner,
    private readonly player: PlayerId,
  ) {
    this.roundStartsAt = runner.state.match.roundStartsAt;
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.alive) return;
      this.yaw -= e.movementX * MOUSE_RAD_PER_COUNT;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * MOUSE_RAD_PER_COUNT, -PITCH_LIMIT, PITCH_LIMIT);
    });
    // 左：所持中は投擲、非所持は跳ね返し。右：キャッチ（rules.md「入力設定とHUD」）。
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.send({ kind: 'primary' });
      if (e.button === 2) this.send({ kind: 'secondary' });
    });
    document.addEventListener('contextmenu', (e) => {
      if (this.locked) e.preventDefault();
    });
    document.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (!this.locked || e.repeat) return;
      if (e.code === 'ShiftLeft') this.send({ kind: 'step' });
      if (e.code === 'KeyC') this.send({ kind: 'summon' });
      if (e.code === 'KeyF') this.send({ kind: 'feint' });
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  private get alive(): boolean {
    return this.runner.state.players.find(p => p.id === this.player)!.hp > 0;
  }

  /** 次ラウンド・再戦ではsimの初期yawへ戻し、押下状態を新たに送る（0010）。 */
  sync(): void {
    this.yaw = this.runner.state.players.find(p => p.id === this.player)!.yaw;
    this.roundStartsAt = this.runner.state.match.roundStartsAt;
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
    if (!this.alive) return;
    const axis = (plus: string, minus: string) => (this.keys.has(plus) ? 1 : 0) - (this.keys.has(minus) ? 1 : 0);
    const forward = axis('KeyW', 'KeyS');
    const right = axis('KeyD', 'KeyA');
    const move = this.locked
      ? {
          x: -Math.sin(this.yaw) * forward + Math.cos(this.yaw) * right,
          z: -Math.cos(this.yaw) * forward - Math.sin(this.yaw) * right,
        }
      : { x: 0, z: 0 };
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
