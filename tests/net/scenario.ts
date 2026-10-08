import { PROTOCOL } from '../../src/net/room-protocol';
import { Bot } from '../../src/game/bot';
import { evenMatch, rosterOf } from '../fixtures';
import { defaultConfig } from '../../src/sim/config';
import { createInitialState } from '../../src/sim/sim';
import type { MatchMode, PlayerId, SimState } from '../../src/sim/types';
import { MemoryClient } from '../../src/net/client';
import { MemoryHost } from '../../src/net/host';
import { MemoryDelivery } from '../../src/net/memory';
import { canonical, type Session } from '../../src/net/messages';

export interface ScenarioOptions { mode: MatchMode; rttMs: number; jitterMs: number; loss: number; seconds: number; seed: number }
export function runScenario(options: ScenarioOptions) {
  const config = defaultConfig;
  const session: Session = { matchId: 'netbench', epoch: 1, build: 'm2-memory', protocol: PROTOCOL, config, roster: [],
    initial: createInitialState(evenMatch(options.mode, 'a'), config) };
  session.roster = rosterOf(session.initial);
  const ids = session.initial.players.map(p => p.id);
  const host = new MemoryHost(session, Object.fromEntries(ids.map(id => [id, id])));
  const clients = ids.filter(id => id !== 'p1').map(id => new MemoryClient(session, id));
  const delivery = new MemoryDelivery({ ...options, duplicate: 0.02 });
  const actors = ids.map(id => ({ id, bot: new Bot(id), seq: 0 }));
  let invariantFailures = 0;
  const valid = (state: SimState) => {
    if (!state.players.every(p => Number.isFinite(p.hp) && p.hp >= 0 && p.hp <= p.maxHp)
      || (state.ball.mode === 'held' && !ids.includes(state.ball.owner))) invariantFailures++;
  };
  for (const id of ids) host.connect(id, session);
  delivery.bind('host', (from, msg, at) => host.receive(from, msg, at));
  for (const client of clients) delivery.bind(client.player, (from, msg, at) => {
    client.receive(from, msg, at);
    if (msg.kind === 'events') delivery.send(client.player, 'host', 'event', client.eventAck(), at);
  });
  const sendHost = (at: number) => {
    for (const out of host.drain()) if (out.to !== 'p1') delivery.send('host', out.to, out.channel, out.message, at);
  };
  const duration = options.seconds * config.timeUnitsPerSecond;
  for (let at = 0; at < duration; at += config.tick) {
    delivery.advance(at);
    for (const actor of actors) {
      const client = clients.find(cl => cl.player === actor.id), state = client?.state ?? host.state;
      // 操作者の代わりにローカル予測だけを見るBotを使う。ネット上のBot再思考とは別。
      const actions = actor.bot.think(state);
      const self = state.players.find(p => p.id === actor.id)!;
      const inputs = [{ kind: 'move' as const, ...self.move }, { kind: 'keys' as const, ...self.keys },
        { kind: 'yaw' as const, yaw: self.yaw }, ...actions];
      // Q・防御のエッジも毎秒注入する。押下状態の周期送信からは生成しない。
      if (at > config.timeUnitsPerSecond && at % 60000 === 0) inputs.push({ kind: 'cycle-target', player: actor.id, at, seq: 0 });
      if (at > config.timeUnitsPerSecond && at % 47000 === 0) inputs.push({ kind: 'secondary', player: actor.id, at, seq: 0 });
      if (client) {
        for (const input of inputs) {
          const { player: _player, at: _at, seq: _seq, ...payload } = input as typeof actions[number];
          client.input(payload, at);
        }
        delivery.send(actor.id, 'host', 'input', client.batch(), at);
      } else {
        host.receive('p1', { kind: 'input', matchId: session.matchId, epoch: session.epoch,
          commands: inputs.map(input => ({ ...input, player: 'p1' as PlayerId, at, seq: actor.seq++ })) }, at);
      }
    }
    delivery.advance(at); host.advance(at + config.tick); sendHost(at);
    clients.forEach(cl => { cl.advance(at + config.tick); valid(cl.state); }); valid(host.state);
  }
  // 入力生成を止めて100msを確定。配送損失の回復も同じ配送器で行う。
  for (let at = duration; at <= duration + 60000; at += config.tick) {
    delivery.advance(at);
    clients.forEach(cl => delivery.send(cl.player, 'host', 'input', cl.batch(), at));
    delivery.advance(at); host.advance(at); sendHost(at);
  }
  const snapshot = host.snapshot();
  clients.forEach(cl => delivery.send('host', cl.player, 'state', snapshot, duration + 60000));
  // 最後のstateが落ちた場合も完全状態を再配信する。simはここでは進めない。
  for (let at = duration + 61000; at <= duration + 120000; at += 3000) {
    delivery.advance(at);
    clients.forEach(cl => {
      delivery.send('host', cl.player, 'state', host.snapshot(), at);
      delivery.send('host', cl.player, 'event', host.eventsFor(cl.player), at);
    });
  }
  delivery.advance(duration + 180000);
  const mismatches = clients.filter(cl => canonical(cl.confirmed) !== canonical(snapshot.confirmed)
    || canonical(cl.events) !== canonical(host.events)).length;
  return { ...options, mismatches, invariantFailures,
    corrections: clients.reduce((sum, cl) => sum + cl.stats.corrections, 0),
    lateRejected: host.stats.lateRejected + host.stats.finalRejected,
    bytes: delivery.stats.bytes, events: host.events.length, rollbacks: host.stats.rollbacks,
    replayedTicks: host.stats.replayedTicks, maxQueued: delivery.stats.maxQueued };
}
