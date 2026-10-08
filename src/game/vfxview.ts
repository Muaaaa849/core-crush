// VFXの描画。線分は1つの使い回すジオメトリへ毎フレーム詰め、閃光は1つの球を使い回す（0012：追加ライト・粒子エディタなし）。
import * as THREE from 'three/webgpu';
import { EFFECT_LIMITS, SEGMENTS_PER_KIND, effectSegments, liveEffects, type Effect, type EffectKind } from './vfx';

const MAX_SEGMENTS = (Object.keys(EFFECT_LIMITS) as EffectKind[])
  .reduce((sum, kind) => sum + EFFECT_LIMITS[kind] * SEGMENTS_PER_KIND[kind], 0);

export class VfxView {
  private readonly positions = new Float32Array(MAX_SEGMENTS * 6);
  private readonly colors = new Float32Array(MAX_SEGMENTS * 6);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly lines: THREE.LineSegments;
  private readonly flash: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly color = new THREE.Color();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  constructor(scene: THREE.Scene, private readonly ballRadius: number) {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    // 加算合成なので、明るさを色へ掛けるだけでフェードになる。深度は書かず、球やキャラを隠さない。
    const lines = this.lines = new THREE.LineSegments(this.geometry, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    lines.frustumCulled = false;
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), new THREE.MeshBasicMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.flash.visible = false;
    scene.add(lines, this.flash);
  }

  update(effects: readonly Effect[], now: number, camera: THREE.Camera, flashScale: number): void {
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const basis = { right: this.right, up: this.up };
    let n = 0;
    this.flash.visible = false;
    for (const e of liveEffects(effects, now)) {
      const age = now - e.startedAt;
      if (e.kind === 'flash') {
        const u = age / e.lifeMs;
        this.flash.visible = flashScale > 0;
        this.flash.position.set(e.position.x, e.position.y, e.position.z);
        this.flash.scale.setScalar(1 + 1.5 * u);
        this.flash.material.color.set(e.color).multiplyScalar((1 - u) * flashScale);
        continue;
      }
      const { segments, colors, intensity } = effectSegments(e, age, basis, this.ballRadius);
      for (let i = 0; i < segments.length; i++) {
        if (n >= MAX_SEGMENTS) break;
        const [a, b] = segments[i];
        this.color.set(colors[i]).multiplyScalar(intensity);
        this.positions.set([a.x, a.y, a.z, b.x, b.y, b.z], n * 6);
        this.colors.set([this.color.r, this.color.g, this.color.b, this.color.r, this.color.g, this.color.b], n * 6);
        n++;
      }
    }
    this.lines.visible = n > 0; // 空の描画呼び出しを出さない
    this.geometry.setDrawRange(0, n * 2);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
}
