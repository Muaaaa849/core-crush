import { describe, expect, it, vi } from 'vitest';
import { RoomLogic, Quotas, issueIce, ROOM_TTL, TURN_TTL } from '../../worker/logic';

const now = 100_000;
const make = (mode = '2v2') => new RoomLogic(mode, 'build', now);
describe('room signaling', () => {
  it('T10-29 assigns the roster for all formats and rejects excess joins and different builds', () => {
    for (const [mode, ids] of [['1v1', ['p1', 'p3']], ['1v2', ['p1', 'p3', 'p4']], ['2v2', ['p1', 'p2', 'p3', 'p4']]] as const) {
      const room = make(mode);
      expect(() => room.join('other', now)).toThrow('build');
      const joined = ids.map(() => room.join('build', now));
      expect(joined.map(p => p.id)).toEqual(ids);
      expect(room.public().players.map(p => p.side)).toEqual(mode === '2v2' ? ['a', 'a', 'b', 'b'] : ids.map((_, i) => i ? 'b' : 'a'));
      expect(new Set(joined.map(p => p.token)).size).toBe(ids.length);
      expect(() => room.join('build', now)).toThrow('full');
      expect(JSON.stringify(room.public())).not.toContain(joined[0].token);
      expect(() => room.authenticate('invalid', now)).toThrow('token');
      expect(() => room.authenticate(joined[0].token, now + ROOM_TTL)).toThrow('expired');
    }
    expect(() => make('3v3')).toThrow('format');
  });
  it('T10-29 authenticates star signaling and only counts down after every matching load ACK', () => {
    const room = make('1v1'), host = room.join('build', now), guest = room.join('build', now);
    expect(() => room.begin(guest.id, now, [host.id, guest.id])).toThrow('host');
    expect(() => room.begin(host.id, now, [host.id])).toThrow('connected');
    room.begin(host.id, now, [host.id, guest.id]);
    expect(room.relay(guest.id, { kind: 'signal', to: host.id, matchId: room.public().matchId, description: { type: 'answer', sdp: 'sdp' } }, now).to).toBe(host.id);
    expect(() => room.relay(guest.id, { kind: 'signal', to: guest.id, matchId: room.public().matchId }, now)).toThrow();
    expect(room.loaded(host.id, 'signature', now)).toBe(false);
    expect(() => room.loaded(guest.id, 'other', now)).toThrow('signature');
    expect(room.loaded(guest.id, 'signature', now + 10)).toBe(true);
    expect(room.public().startAt).toBe(now + 3010);
    room.confirm(host.id);
    expect(room.public().phase).toBe('countdown');
    room.confirm(guest.id);
    expect(room.public().phase).toBe('lobby');
  });
  it('T10-29 refuses loading at the 20 second boundary and permits retry', () => {
    const room = make('1v1'), a = room.join('build', now), b = room.join('build', now);
    room.begin(a.id, now, [a.id, b.id]);
    room.loaded(a.id, 'same', now);
    expect(() => room.loaded(b.id, 'same', now + 20_000)).toThrow('deadline');
    room.abort();
    room.begin(a.id, now + 20_001, [a.id, b.id]);
    expect(room.public().phase).toBe('connecting');
  });
  it('T10-31 bounds room creation and daily credential grants', () => {
    const quotas = new Quotas();
    for (let i = 0; i < 4; i++) quotas.create(String(i), now);
    expect(() => quotas.create('fifth', now)).toThrow('limit');
    for (let i = 0; i < 96; i++) quotas.turn(now);
    expect(() => quotas.turn(now)).toThrow('limit');
    quotas.turn(now + 86_400_000);
    const daily = new Quotas();
    for (let i = 0; i < 24; i++) daily.create(String(i), i * ROOM_TTL / 4 + 1);
    expect(() => daily.create('excess', 24 * ROOM_TTL / 4 + 1)).toThrow('limit');
    const requests = new Quotas();
    for (let i = 0; i < 5000; i++) requests.request(now);
    expect(() => requests.request(now)).toThrow('limit');
  });
  it('T10-31 authenticates, rate limits and expires credential grants', () => {
    const room = make('1v1'), a = room.join('build', now);
    expect(() => room.grant('bad', now)).toThrow('token');
    room.grant(a.token, now);
    expect(() => room.grant(a.token, now + 59_999)).toThrow('limit');
    room.grant(a.token, now + 60_000);
    for (let i = 2; i < 32; i++) room.grant(a.token, now + i * 60_000);
    expect(() => room.grant(a.token, now + 32 * 60_000)).toThrow('limit');
    expect(() => room.grant(a.token, now + ROOM_TTL)).toThrow('expired');
  });
  it('T10-31 returns STUN only without secrets and never calls the remote API', async () => {
    const fetcher = vi.fn();
    const ice = await issueIce({}, now, fetcher);
    expect(ice.mode).toBe('stun-only');
    expect(ice.reason).toBe('secrets-missing');
    expect(ice.iceServers).toEqual([{ urls: 'stun:stun.cloudflare.com:3478' }]);
    expect(fetcher).not.toHaveBeenCalled();
    const disabled = await issueIce({ TURN_KEY_ID: 'key', TURN_KEY_API_TOKEN: 'secret', TURN_ENABLED: 'false' }, now, fetcher);
    expect(disabled.reason).toBe('turn-disabled'); expect(fetcher).not.toHaveBeenCalled();
  });
  it('T10-31 requests short lived credentials server side and refuses failed responses', async () => {
    const env = { TURN_KEY_ID: 'private-id', TURN_KEY_API_TOKEN: 'private-secret', TURN_ENABLED: 'true' };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ iceServers: [{ urls: 'turn:turn.cloudflare.com:3478', username: 'short', credential: 'short-password' }] }), { status: 201 }));
    const ice = await issueIce(env, now, fetcher);
    expect(ice.expiresAt).toBe(now + TURN_TTL * 1000);
    expect(fetcher.mock.calls[0][1].body).toBe(JSON.stringify({ ttl: TURN_TTL }));
    expect(JSON.stringify(ice)).not.toContain('private');
    fetcher.mockResolvedValue(new Response('denied', { status: 403 }));
    await expect(issueIce(env, now, fetcher)).rejects.toThrow('TURN');
    fetcher.mockResolvedValue(new Response('{}', { status: 201 }));
    await expect(issueIce(env, now, fetcher)).rejects.toThrow('TURN');
  });
});
