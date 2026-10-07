import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TargetView } from '../../src/game/targetview';
import { flight, incoming } from '../sim/cover-helpers';
describe('M2 target marks', () => {
  it('T10-23: distinct 3D marks follow lock and flight IDs independently and hide null targets', () => {
    const scene = new THREE.Scene(), view = new TargetView(scene), s = incoming();
    const position = (id: typeof s.players[number]['id']) => new THREE.Vector3(...[s.players.find(p => p.id === id)!.position.x, 0, s.players.find(p => p.id === id)!.position.z]);
    s.players[3].position.x = 4; s.players[0].lockTarget = 'p4';
    view.update(s, 'p1', position);
    expect(view.lock.visible).toBe(true); expect(view.flight.visible).toBe(true);
    expect(view.lock.position.x).toBe(4); expect(view.flight.position.x).toBe(0);
    expect(view.lock.geometry.type).not.toBe(view.flight.geometry.type);
    flight(s).attack!.target = null; view.update(s, 'p1', position); expect(view.flight.visible).toBe(false);
  });
});
