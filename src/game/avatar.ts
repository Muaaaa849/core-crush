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

/**
 * キャラ・チームの目印（0013）。共通モデルは材質が1つ（肌込み）なので、キャラ色は胸の発光帯、
 * チーム色は足元の輪と名札の縁に出す。モデルの拡大率を打ち消して実寸（m）で付ける。
 */
export function addMarkers(root: THREE.Object3D, label: string, team: string, colors: { base: string; emissive: string }, showName: boolean):
  { update(reserved: boolean, flash: number): void } {
  const group = new THREE.Group();
  group.scale.setScalar(1 / root.scale.x);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 32), new THREE.MeshBasicMaterial({ color: colors.emissive }));
  band.rotation.x = Math.PI / 2; band.position.y = 1.18;
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.012, 6, 32), new THREE.MeshBasicMaterial({ color: colors.base }));
  trim.rotation.x = Math.PI / 2; trim.position.y = 1.12;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), new THREE.MeshBasicMaterial({ color: team, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
  group.add(band, trim, ring);
  // 本人の名札は出さない（TPSで画面中央を塞ぐ）。本人の予約はHUD・胸帯・保持球の輪で伝える。
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  tag.scale.set(1.8, 0.45, 1); tag.position.y = 2.15;
  group.add(tag);
  let previous: boolean | undefined;
  function update(reserved: boolean, flash: number): void {
    band.material.color.set(reserved ? '#fff1b0' : colors.emissive).multiplyScalar(reserved ? 1 + flash : 1);
    trim.material.color.set(reserved ? '#ffe27a' : colors.base);
    tag.visible = showName;
    if (previous === reserved) return;
    previous = reserved;
    g.clearRect(0, 0, 512, 128);
    g.fillStyle = 'rgb(5 6 11 / 0.7)'; g.fillRect(0, 0, 512, 128);
    g.strokeStyle = team; g.lineWidth = 8; g.strokeRect(4, 4, 504, 120);
    g.fillStyle = '#ffffff'; g.font = '600 36px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, 256, reserved ? 40 : 64, 480);
    if (reserved) { g.fillStyle = '#ffe27a'; g.fillText('強化予約', 256, 94); }
    texture.needsUpdate = true;
  }
  root.add(group);
  update(false, 0);
  return { update };
}
