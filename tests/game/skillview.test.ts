import { describe, expect, it } from 'vitest';
import { skillHudLines, overchargeVisible, localReservationRing, blinkPreview, playerDisplayPosition,
  updateSkillNotices, skillReasonLabel } from '../../src/game/skillview';
import { SKILLS } from '../../src/game/characters';
import { skillKind, skillRejection, blinkDestination } from '../../src/sim/skills';
import { defaultConfig as c } from '../../src/sim/config';
import { createInitialState } from '../../src/sim/sim';
import { localRoster, rosterMatch } from '../../src/game/match';
import type { SimEvent, SkillRejectReason } from '../../src/sim/types';

function active() {
  const s = createInitialState(rosterMatch(localRoster('1v1', 'volt'), 'a'), c);
  s.now = s.match.roundStartsAt; s.danger = { side: 'a', expiresAt: s.now + c.dangerDuration };
  s.players[0].cost = 20; s.players[0].position = { x: 0, y: 0, z: 8 }; s.players[0].yaw = 0;
  return s;
}

describe('K14-28 skill HUD text', () => {
  it('K14-28: implementation status comes from sim; active keys and costs follow the current slots', () => {
    for (const [id, definition] of Object.entries(SKILLS))
      expect(definition.status).toBe(skillKind(id as keyof typeof SKILLS) === 'unimplemented' ? 'unimplemented' : 'implemented');
    const s = active(), p = s.players[0];
    expect(skillHudLines(s, p, c, ['G / マウス5', 'H'])).toEqual([
      '[G / マウス5] オーバーチャージ コスト1.5 使用可', '[H] ブリンク コスト1.5 使用可',
    ]);
    p.skills = ['blink', 'overcharge'];
    expect(skillHudLines(s, p, c, ['G', 'H'])[0]).toBe('[G] ブリンク コスト1.5 使用可');
  });

  it('K14-28: CT and reservation round positive time up to 0.1s, and reserved low funds are explicit', () => {
    const s = active(), p = s.players[0];
    p.skillReadyAt[1] = s.now + 1;
    p.overcharge = { slot: 1, expiresAt: s.now + c.timeUnitsPerSecond * 1.01 }; p.cost = 5;
    const lines = skillHudLines(s, p, c, ['E', 'R']);
    expect(lines[0]).toContain('予約：残り1.1秒／次の手投げで1.5消費');
    expect(lines[0]).toContain('不可：予約済み'); expect(lines[0]).toContain('次の手投げは強化不可');
    expect(lines[1]).toContain('CT 0.1秒');
    s.now = p.overcharge.expiresAt; p.overcharge = null; p.cost = 20;
    expect(skillHudLines(s, p, c, ['E', 'R']).join()).not.toContain('予約：');
  });

  it.each(['phase', 'ko', 'busy', 'cooldown', 'reserved', 'cost', 'destination'] as const)(
    'K14-28: %s uses the sim rejection and never claims availability', reason => {
      const s = active(), p = s.players[0]; const slot = reason === 'destination' ? 2 : 1;
      if (reason === 'phase') s.match.phase = 'result';
      if (reason === 'ko') p.hp = 0;
      if (reason === 'busy') p.action = { kind: 'recovery', endsAt: s.now + c.frame };
      if (reason === 'cooldown') p.skillReadyAt[0] = s.now + c.timeUnitsPerSecond * 1.01;
      if (reason === 'reserved') p.overcharge = { slot: 1, expiresAt: s.now + c.frame };
      if (reason === 'cost') p.cost = 5;
      if (reason === 'destination') p.position.z = c.playerMinDepth;
      expect(skillRejection(s, p, slot, c)).toBe(reason);
      const line = skillHudLines(s, p, c, ['E', 'R'])[slot - 1];
      expect(line).toContain(`不可：${skillReasonLabel(reason)}`); expect(line).not.toContain('使用可');
    });

  it('K14-28: AP/PP passives have no key or CT, while remaining effects say unimplemented', () => {
    const s = active(), p = s.players[0]; p.skills = ['charge', 'economy'];
    expect(skillHudLines(s, p, c, ['E', 'R'])).toEqual(['常時：蓄勢 good +0.75', '常時：省エネ 召喚0.75']);
    p.skills = ['chain', 'charge'];
    expect(skillHudLines(s, p, c, ['E', 'R'])).toEqual(['[E] チェーンハンド — 未実装', '常時：蓄勢 good +0.75']);
  });
});

describe('K14-29 reservation visibility from state', () => {
  it('K14-29: null, expiry and correction remove markers, and JSON restoration restores them', () => {
    const s = active(), p = s.players[0]; expect(overchargeVisible(p, s.now)).toBe(false);
    p.overcharge = { slot: 1, expiresAt: s.now + 1 }; expect(overchargeVisible(p, s.now)).toBe(true);
    expect(overchargeVisible(JSON.parse(JSON.stringify(p)), s.now)).toBe(true);
    expect(overchargeVisible(p, s.now + 1)).toBe(false);
    p.overcharge = null; expect(overchargeVisible(p, s.now)).toBe(false);
  });
  it('K14-29: only the reserved local holder gets a ball ring', () => {
    const s = active(), p = s.players[0]; p.overcharge = { slot: 1, expiresAt: s.now + 1 };
    s.ball = { mode: 'held', owner: 'p1' }; expect(localReservationRing(s, 'p1')).toBe(true);
    s.ball = { mode: 'held', owner: 'p3' }; expect(localReservationRing(s, 'p1')).toBe(false);
    expect(localReservationRing(s, 'p3')).toBe(false);
    s.ball = { mode: 'absent', side: 'a', appearsAt: s.now + 1 }; expect(localReservationRing(s, 'p1')).toBe(false);
  });
});

describe('K14-30 blink preview and instantaneous display position', () => {
  it('K14-30: destination uses logical input yaw and exactly matches sim destination, including outside', () => {
    const s = active(), p = s.players[0];
    const yaw = Math.PI / 2, before = structuredClone(s);
    expect(blinkPreview(s, 'p1', yaw, true, c)).toEqual({ position: blinkDestination({ ...p, yaw }, c), outside: false });
    expect(s).toEqual(before);
    p.position.x = -c.playerHalfWidth;
    expect(blinkPreview(s, 'p1', yaw, true, c)).toEqual({ position: blinkDestination({ ...p, yaw }, c), outside: true });
    p.position.x = -c.playerHalfWidth + c.blinkDistance;
    expect(blinkPreview(s, 'p1', yaw, true, c)?.outside).toBe(false);
  });
  it('K14-30: menus/interruption, KO, result and missing blink hide the preview; cooldown does not', () => {
    const s = active(), p = s.players[0];
    expect(blinkPreview(s, 'p1', 0, false, c)).toBeNull();
    p.hp = 0; expect(blinkPreview(s, 'p1', 0, true, c)).toBeNull(); p.hp = 100;
    for (const phase of ['result', 'over'] as const) { s.match.phase = phase; expect(blinkPreview(s, 'p1', 0, true, c)).toBeNull(); }
    s.match.phase = 'play'; p.skills = ['charge', 'economy']; expect(blinkPreview(s, 'p1', 0, true, c)).toBeNull();
    p.skills = ['blink', 'charge']; p.skillReadyAt[0] = s.now + c.timeUnitsPerSecond; p.cost = 0;
    expect(blinkPreview(s, 'p1', 0, true, c)).not.toBeNull();
  });
  it('K14-30: ordinary movement interpolates, a 4m blink and round change snap at all alphas', () => {
    const a = active(), b = structuredClone(a); b.players[0].position.x += 1;
    expect(playerDisplayPosition(a, b, 'p1', 0.5)).toEqual({ x: 0.5, y: 0, z: 8 });
    b.players[0].position.x = 4;
    for (const alpha of [0, 0.5, 1]) expect(playerDisplayPosition(a, b, 'p1', alpha)).toEqual(b.players[0].position);
    b.players[0].position.x = 1; b.match.roundStartsAt++;
    expect(playerDisplayPosition(a, b, 'p1', 0)).toEqual(b.players[0].position);
  });
});

describe('K14-31 local slot notices', () => {
  const rejected = (player: 'p1' | 'p3', slot: 1 | 2, reason: SkillRejectReason): SimEvent =>
    ({ kind: 'skill-rejected', at: 60000, player, slot, reason });
  it('K14-31: only the local matching slot changes, lasts exactly 1s, and latest attempt wins', () => {
    const s = active(), p = s.players[0];
    let notices = updateSkillNotices([null, null], [rejected('p3', 1, 'cost'), rejected('p1', 2, 'destination')], 'p1', 1000);
    expect(notices[0]).toBeNull();
    expect(skillHudLines(s, p, c, ['E', 'R'], notices, 1999)[1]).toContain('不成立：範囲外');
    expect(skillHudLines(s, p, c, ['E', 'R'], notices, 2000).join()).not.toContain('不成立：');
    notices = updateSkillNotices(notices, [rejected('p1', 2, 'busy'), rejected('p1', 2, 'cost')], 'p1', 2100);
    expect(skillHudLines(s, p, c, ['E', 'R'], notices, 2100)[1]).toContain('不成立：コスト不足');
    expect(skillHudLines(s, p, c, ['E', 'R'], notices, 2100)[0]).not.toContain('不成立：');
  });
});
