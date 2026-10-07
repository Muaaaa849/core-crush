// ローカルプレイヤーの入力をsimコマンドへ変換し、TPSカメラを動かす（feel.md「入力設定」「カメラ」）。
// 視点の回転は即座に画面へ反映し、simへは向き（yaw）として渡す。
import * as THREE from 'three/webgpu';
import type { PlayerId } from '../sim/types';
import type { SimRunner } from './runner';

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
  private sentYaw = NaN;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly runner: SimRunner,
    private readonly player: PlayerId,
  ) {
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
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
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** 描画フレームごとに、変化した移動入力と向きをsimへ渡す。 */
  update(): void {
    const axis = (plus: string, minus: string) => (this.keys.has(plus) ? 1 : 0) - (this.keys.has(minus) ? 1 : 0);
    const forward = axis('KeyW', 'KeyS');
    const right = axis('KeyD', 'KeyA');
    const move = this.locked
      ? {
          x: -Math.sin(this.yaw) * forward + Math.cos(this.yaw) * right,
          z: -Math.cos(this.yaw) * forward - Math.sin(this.yaw) * right,
        }
      : { x: 0, z: 0 };
    if (move.x !== this.sentMove.x || move.z !== this.sentMove.z) {
      this.sentMove = move;
      this.send({ kind: 'move', ...move });
    }
    if (this.yaw !== this.sentYaw) {
      this.sentYaw = this.yaw;
      this.send({ kind: 'yaw', yaw: this.yaw });
    }
  }

  /** 表示上のキャラ位置に合わせてTPSカメラを置く。 */
  placeCamera(camera: THREE.PerspectiveCamera, body: THREE.Vector3): void {
    const look = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    camera.position
      .copy(body)
      .add(new THREE.Vector3(0, EYE_HEIGHT + CAMERA_UP, 0))
      .addScaledVector(right, CAMERA_RIGHT)
      .addScaledVector(look, -CAMERA_BACK);
    camera.lookAt(camera.position.clone().add(look));
  }

  private send(input: { kind: 'primary' | 'secondary' | 'step' | 'summon' } | { kind: 'move'; x: number; z: number } | { kind: 'yaw'; yaw: number }): void {
    this.runner.input({ ...input, player: this.player });
  }
}
