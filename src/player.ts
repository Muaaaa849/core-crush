// M0の仮プレイヤー：マウス捕捉・WASD移動・TPSカメラ。ルール判定はM1でsimへ分離する。
import * as THREE from 'three/webgpu';
import { defaultConfig } from './sim/config';

const WALK_SPEED = 5; // m/s（rules.md 基準歩行速度）
const MOUSE_RAD_PER_COUNT = THREE.MathUtils.degToRad(0.022 * 2);
const PITCH_LIMIT = 1.2;
// P1側の移動範囲（glTFではz>0）。値はsimと共通（rules.md「プレイエリア」）。小物とは衝突しない。
const { playerHalfWidth, playerMinDepth, playerMaxDepth } = defaultConfig;
const COURT = { minX: -playerHalfWidth, maxX: playerHalfWidth, minZ: playerMinDepth, maxZ: playerMaxDepth };
// TPSの肩越し位置（初期案）
const EYE_HEIGHT = 1.6;
const CAMERA_BACK = 2.2;
const CAMERA_RIGHT = 0.5;
const CAMERA_UP = 0.35;

export class Player {
  private yaw = 0; // 0で-z（中央フェンス）を向く
  private pitch = 0;
  private readonly keys = new Set<string>();
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction;
  private readonly run: THREE.AnimationAction;
  private running = false;

  constructor(
    private readonly body: THREE.Object3D,
    clips: THREE.AnimationClip[],
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.mixer = new THREE.AnimationMixer(body);
    const action = (name: string) => {
      const clip = THREE.AnimationClip.findByName(clips, name);
      if (!clip) throw new Error(`character.glb にアニメーション ${name} がない`);
      return this.mixer.clipAction(clip);
    };
    this.idle = action('idle');
    this.run = action('run');
    this.idle.play();

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.yaw -= e.movementX * MOUSE_RAD_PER_COUNT;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * MOUSE_RAD_PER_COUNT, -PITCH_LIMIT, PITCH_LIMIT);
    });
    document.addEventListener('keydown', (e) => this.keys.add(e.code));
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  update(dt: number): void {
    const axis = (plus: string, minus: string) => (this.keys.has(plus) ? 1 : 0) - (this.keys.has(minus) ? 1 : 0);
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const move = forward.clone().multiplyScalar(axis('KeyW', 'KeyS')).addScaledVector(right, axis('KeyD', 'KeyA'));
    if (!this.locked) move.set(0, 0, 0);

    const moving = move.lengthSq() > 0;
    if (moving) {
      const p = this.body.position.addScaledVector(move.normalize(), WALK_SPEED * dt);
      p.x = THREE.MathUtils.clamp(p.x, COURT.minX, COURT.maxX);
      p.z = THREE.MathUtils.clamp(p.z, COURT.minZ, COURT.maxZ);
    }
    if (moving !== this.running) {
      this.running = moving;
      const [from, to] = moving ? [this.idle, this.run] : [this.run, this.idle];
      to.reset().play();
      from.crossFadeTo(to, 0.15, false);
    }
    this.body.rotation.y = this.yaw + Math.PI;
    this.mixer.update(dt);

    const look = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    this.camera.position
      .copy(this.body.position)
      .add(new THREE.Vector3(0, EYE_HEIGHT + CAMERA_UP, 0))
      .addScaledVector(right, CAMERA_RIGHT)
      .addScaledVector(look, -CAMERA_BACK);
    this.camera.lookAt(this.camera.position.clone().add(look));
  }
}
