// simのプレイヤーを表示する（見た目だけ。判定はsim）。
import * as THREE from 'three/webgpu';

const RUN_SPEED_THRESHOLD = 0.5; // m/s
const HITSTUN_LEAN = 0.25; // rad。被弾クリップができるまでの仮の後ろ反り

export class Avatar {
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction;
  private readonly run: THREE.AnimationAction;
  private running = false;
  private readonly last = new THREE.Vector3();

  constructor(readonly root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);
    const action = (name: string) => {
      const clip = THREE.AnimationClip.findByName(clips, name);
      if (!clip) throw new Error(`character.glb にアニメーション ${name} がない`);
      return this.mixer.clipAction(clip);
    };
    this.idle = action('idle');
    this.run = action('run');
    this.idle.play();
  }

  /**
   * position：補間済みのsim位置（足元）。yaw：simの規約（0で-z）。animationDt：ヒットストップ中は0。
   * stun：被弾硬直の残り（1→0）。押し出しを走りと見せず、後ろへ反らせる。
   */
  update(position: THREE.Vector3, yaw: number, dt: number, animationDt = dt, stun = 0): void {
    const speed = dt > 0 ? position.distanceTo(this.last) / dt : 0;
    this.last.copy(position);
    const running = stun === 0 && speed > RUN_SPEED_THRESHOLD;
    if (running !== this.running) {
      this.running = running;
      const [from, to] = running ? [this.idle, this.run] : [this.run, this.idle];
      to.reset().play();
      from.crossFadeTo(to, 0.15, false);
    }
    this.root.position.copy(position);
    this.root.rotation.set(-HITSTUN_LEAN * stun, yaw + Math.PI, 0, 'YXZ'); // モデルは+zを向いている
    this.mixer.update(animationDt);
  }
}
