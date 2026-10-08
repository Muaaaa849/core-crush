// 継続するスキル目印。毎フレーム描画stateから再構成し、成功イベントや演出の寿命を持たない。
import * as THREE from 'three/webgpu';
import type { SimConfig } from '../sim/config';
import type { PlayerId, SimState } from '../sim/types';
import { blinkPreview, localReservationRing } from './skillview';

export class SkillMarkers {
  private readonly heldRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly floor = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.24, 32),
    new THREE.MeshBasicMaterial({ color: '#57c7ff', side: THREE.DoubleSide }));
  private readonly outsideLabel: THREE.Sprite;

  constructor(scene: THREE.Scene, private readonly config: SimConfig) {
    const segments = 64;
    // 内縁の辺（弦）も球半径＋0.1mの外。球モデルの拡大率を受けないワールド空間へ置く。
    const inner = (config.ballDiameter / 2 + 0.1) / Math.cos(Math.PI / segments);
    this.heldRing = new THREE.Mesh(new THREE.RingGeometry(inner, inner + 0.012, segments),
      new THREE.MeshBasicMaterial({ color: '#ffe27a', side: THREE.DoubleSide }));
    this.heldRing.name = 'overcharge-held-ring'; this.floor.name = 'blink-destination';
    this.floor.rotation.x = -Math.PI / 2;
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
    const g = canvas.getContext('2d')!;
    g.fillStyle = 'rgb(5 6 11 / 0.85)'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#ff718a'; g.font = '600 36px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('範囲外', 128, 32);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    this.outsideLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
    this.outsideLabel.name = 'blink-outside-label'; this.outsideLabel.scale.set(0.8, 0.2, 1);
    this.heldRing.visible = this.floor.visible = this.outsideLabel.visible = false;
    scene.add(this.heldRing, this.floor, this.outsideLabel);
  }

  update(state: SimState, local: PlayerId, yaw: number, active: boolean, ballVisible: boolean,
    ballPosition: THREE.Vector3, camera: THREE.Camera): void {
    this.heldRing.visible = ballVisible && localReservationRing(state, local);
    this.heldRing.position.copy(ballPosition); this.heldRing.quaternion.copy(camera.quaternion);
    const preview = blinkPreview(state, local, yaw, active, this.config);
    this.floor.visible = preview !== null; this.outsideLabel.visible = preview?.outside ?? false;
    if (!preview) return;
    this.floor.position.set(preview.position.x, 0.025, preview.position.z);
    this.floor.material.color.set(preview.outside ? '#ff718a' : '#57c7ff');
    this.outsideLabel.position.set(preview.position.x, 0.35, preview.position.z);
  }
}
