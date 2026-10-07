// 選択枠と飛行対象は別の形で示し、表示からsimを書き換えない（0010）。
import * as THREE from 'three/webgpu';
import type { PlayerId, SimState } from '../sim/types';

export class TargetView {
  readonly lock = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.9),
    new THREE.MeshBasicMaterial({ color: 0xffdd55, wireframe: true, depthTest: false }));
  readonly flight = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.035, 6, 32),
    new THREE.MeshBasicMaterial({ color: 0xff6655, depthTest: false }));

  constructor(scene: THREE.Scene) {
    this.flight.rotation.x = -Math.PI / 2;
    this.lock.renderOrder = this.flight.renderOrder = 10;
    scene.add(this.lock, this.flight);
  }

  update(state: SimState, localId: PlayerId, position: (id: PlayerId) => THREE.Vector3): void {
    const local = state.players.find(p => p.id === localId)!;
    const lock = state.players.find(p => p.id === local.lockTarget && p.hp > 0);
    const targetId = state.ball.mode === 'flight' ? state.ball.attack?.target : null;
    const target = state.players.find(p => p.id === targetId && p.hp > 0);
    this.lock.visible = !!lock;
    if (lock) this.lock.position.copy(position(lock.id)).add(new THREE.Vector3(0, 0.95, 0));
    this.flight.visible = !!target;
    if (target) {
      this.flight.position.copy(position(target.id)).add(new THREE.Vector3(0, 0.12, 0));
      this.flight.material.color.set(target.side === local.side ? 0xff6655 : 0x55ccff);
    }
  }
}
