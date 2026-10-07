// wrangler dev --local のHTTP・WebSocketを確認する。秘密や招待コードは出力しない。
import assert from 'node:assert/strict';
import WebSocket from 'ws';

const base = process.env.ROOM_TEST_URL ?? 'http://127.0.0.1:8787';
const origin = 'http://localhost:5173';
async function post(path, body, token, expected = 200, requestOrigin = origin) {
  const response = await fetch(base + path, { method: 'POST', headers: { Origin: requestOrigin, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  assert.equal(response.status, expected, `${path} status`); return response.json();
}
async function connect(admission) {
  const socket = new WebSocket(base.replace(/^http/, 'ws') + `/rooms/${admission.code}/socket`, ['corecrush', admission.token], { origin });
  const packets = [], waits = new Set();
  socket.on('message', text => { const packet = JSON.parse(String(text)); packets.push(packet); for (const check of waits) check(); });
  const next = (predicate, timeout = 3000) => new Promise((resolve, reject) => {
    const finish = () => {
      const i = packets.findIndex(predicate); if (i < 0) return;
      clearTimeout(timer); waits.delete(finish); resolve(packets.splice(i, 1)[0]);
    };
    const timer = setTimeout(() => { waits.delete(finish); reject(Error('WebSocket response timeout')); }, timeout);
    waits.add(finish); finish();
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  return { socket, next, send: value => socket.send(JSON.stringify(value)), clear: () => { packets.length = 0; } };
}
const sockets = [];
try {
  await post('/rooms', { mode: '1v1', build: 'localtest' }, undefined, 403, 'https://refused.invalid');
  const host = await post('/rooms', { mode: '1v1', build: 'localtest' });
  assert.match(host.code, /^[a-f0-9]{32}$/);
  await post(`/rooms/${host.code}/join`, { build: 'different' }, undefined, 409);
  const guest = await post(`/rooms/${host.code}/join`, { build: 'localtest' });
  assert.equal(guest.player, 'p3');
  await post(`/rooms/${host.code}/join`, { build: 'localtest' }, undefined, 409);
  await post(`/rooms/${host.code}/ice`, {}, 'invalid', 401);
  const ice = await post(`/rooms/${host.code}/ice`, {}, host.token);
  assert.equal(ice.mode, 'stun-only'); assert.equal(ice.reason, 'secrets-missing');
  await post(`/rooms/${host.code}/ice`, {}, host.token, 429);
  const a = await connect(host); let b = await connect(guest); sockets.push(a.socket, b.socket);
  b.send({ kind: 'begin' }); assert.match((await b.next(p => p.kind === 'error')).reason, /host/);
  a.clear(); b.clear(); a.send({ kind: 'begin' });
  const room = (await a.next(p => p.kind === 'room' && p.room.phase === 'connecting')).room;
  await b.next(p => p.kind === 'room' && p.room.phase === 'connecting');
  a.send({ kind: 'signal', generation: 1, to: 'p3', matchId: room.matchId, description: { type: 'offer', sdp: 'local-offer' }, from: 'p4' });
  const offer = await b.next(p => p.kind === 'signal'); assert.equal(offer.from, 'p1'); assert.equal(offer.description.sdp, 'local-offer');
  b.send({ kind: 'signal', generation: 1, to: 'p1', matchId: room.matchId, description: { type: 'answer', sdp: 'local-answer' }, from: 'p4' });
  assert.equal((await a.next(p => p.kind === 'signal')).from, 'p3');
  a.send({ kind: 'loaded', matchId: room.matchId, signature: 'same' });
  b.send({ kind: 'loaded', matchId: room.matchId, signature: 'different' });
  await a.next(p => p.kind === 'aborted'); await b.next(p => p.kind === 'aborted');
  a.clear(); b.clear(); a.send({ kind: 'begin' });
  const retry = (await a.next(p => p.kind === 'room' && p.room.phase === 'connecting')).room;
  await b.next(p => p.kind === 'room' && p.room.phase === 'connecting');
  a.send({ kind: 'loaded', matchId: retry.matchId, signature: 'same' });
  const partial = await a.next(p => p.kind === 'room' && p.room.players[0].loaded);
  assert.equal(partial.room.phase, 'connecting');
  b.send({ kind: 'loaded', matchId: retry.matchId, signature: 'same' });
  const countdown = await a.next(p => p.kind === 'room' && p.room.phase === 'countdown');
  assert.ok(countdown.room.startAt - countdown.serverNow <= 3000 && countdown.room.startAt - countdown.serverNow >= 2900);
  const rejoined = await post(`/rooms/${host.code}/join`, { build: 'localtest' }, guest.token);
  assert.equal(rejoined.player, guest.player); assert.equal(rejoined.room.matchId, retry.matchId);
  const oldClosed = new Promise(resolve => b.socket.once('close', resolve));
  b = await connect(rejoined); sockets.push(b.socket); await oldClosed;
  b.send({ kind: 'repair', matchId: retry.matchId });
  assert.equal((await a.next(p => p.kind === 'repair')).from, guest.player);
  a.send({ kind: 'confirm', matchId: retry.matchId }); b.send({ kind: 'confirm', matchId: retry.matchId });
  await a.next(p => p.kind === 'room' && p.room.phase === 'lobby');
  await b.next(p => p.kind === 'room' && p.room.phase === 'lobby');
  a.clear(); b.clear(); a.send({ kind: 'begin' });
  await a.next(p => p.kind === 'room' && p.room.phase === 'connecting');
  await a.next(p => p.kind === 'aborted', 22_000);
  console.log('PASS: room/join, Origin/token/full/build rejection, STUN/rate limit, authenticated SDP relay, load mismatch/retry, 3s countdown, token rejoin/WebSocket replacement/repair, result confirmation, 20s alarm');
} finally { for (const socket of sockets) socket.close(); }
