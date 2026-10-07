// カメラとキャラの間にある物体、カメラに近すぎる物体を半透明にする（feel.md「カメラ」）。
// 見た目だけの処理で、判定には影響しない。
import * as THREE from 'three/webgpu';

const FADED_OPACITY = 0.2;
const NEAR_CAMERA = 0.6; // m。これより近い物体も薄くする
const FADE_PER_SECOND = 8;

interface Fadeable {
  mesh: THREE.Mesh;
  box: THREE.Box3;
  solid: THREE.Material;
  faded: THREE.Material & { opacity: number };
  opacity: number;
}

export class CameraOcclusion {
  private readonly items: Fadeable[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly hits: THREE.Intersection[] = [];

  constructor(root: THREE.Object3D) {
    root.updateWorldMatrix(true, true);
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
      // 半透明用の材質は物体ごとに複製する（共有材質を薄くすると他の配置も薄くなる）。
      const faded = (o.material as THREE.Material).clone() as THREE.Material & { opacity: number };
      faded.transparent = true;
      faded.depthWrite = false;
      this.items.push({ mesh: o, box: new THREE.Box3().setFromObject(o), solid: o.material, faded, opacity: 1 });
    });
  }

  /** targets：カメラから見えていてほしい点（キャラの頭・胸など）。 */
  update(camera: THREE.Camera, targets: readonly THREE.Vector3[], dt: number): void {
    const occluding = new Set<THREE.Mesh>();
    for (const target of targets) {
      const toTarget = target.clone().sub(camera.position);
      const distance = toTarget.length();
      this.raycaster.set(camera.position, toTarget.normalize());
      this.raycaster.far = distance;
      for (const item of this.items) {
        if (!this.raycaster.ray.intersectsBox(item.box)) continue;
        this.hits.length = 0;
        item.mesh.raycast(this.raycaster, this.hits);
        if (this.hits.length > 0) occluding.add(item.mesh);
      }
    }

    const step = Math.min(1, FADE_PER_SECOND * dt);
    for (const item of this.items) {
      const near = item.box.distanceToPoint(camera.position) < NEAR_CAMERA;
      const goal = occluding.has(item.mesh) || near ? FADED_OPACITY : 1;
      item.opacity += (goal - item.opacity) * step;
      if (Math.abs(goal - item.opacity) < 0.01) item.opacity = goal;
      item.faded.opacity = item.opacity;
      item.mesh.material = item.opacity < 1 ? item.faded : item.solid;
    }
  }
}
