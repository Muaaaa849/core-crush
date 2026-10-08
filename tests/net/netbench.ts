import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { runScenario } from './scenario';

it('T10-28: NETBENCH runs all 90 seeded conditions for 60 simulated seconds', () => {
  const results: (ReturnType<typeof runScenario> & { wallMs: number })[] = [];
  const started = performance.now();
  for (const mode of ['1v1', '1v2', '2v2'] as const) for (const rttMs of [0, 40, 80, 120, 160]) {
    for (const loss of [0, 0.01, 0.03]) for (const jitterMs of [0, 20]) {
      const start = performance.now();
      const result = { ...runScenario({ mode, rttMs, loss, jitterMs, seconds: 60, seed: 1 }), wallMs: Math.round(performance.now() - start) };
      results.push(result);
      console.log(`${results.length}/90 ${mode} RTT=${rttMs} loss=${loss} jitter=${jitterMs}: mismatches=${result.mismatches} corrections=${result.corrections}`);
    }
  }
  const total = (key: 'mismatches' | 'invariantFailures' | 'corrections' | 'lateRejected' | 'bytes' | 'replayedTicks') => results.reduce((sum, r) => sum + r[key], 0);
  const output = resolve('docs/benchmarks/net-m2-memory.md');
  const rows = results.map(r => `| ${r.mode} | ${r.rttMs} | ${r.loss * 100} | ${r.jitterMs} | ${r.mismatches} | ${r.invariantFailures} | ${r.events} | ${r.corrections} | ${r.lateRejected} | ${r.bytes} | ${r.replayedTicks} | ${r.maxQueued} | ${r.wallMs} |`);
  const report = [
    '# M2 メモリ内同期計測', '',
    `- 実行日時（UTC）：${new Date().toISOString()}`, '- 再実行：`npm run netbench`',
    '- 条件：3形式 × RTT 0/40/80/120/160ms × 損失0/1/3% × ジッター0/20ms＝90条件。各60秒、seed=1。',
    '- 時間は仮想時刻。60秒の入力生成後、1秒の確定待ちと2秒の配送回復を追加する。実回線・人間の試遊の結果ではない。',
    '- 移動・keys・yaw・pitchを60Hzで送信し、Q・防御を周期的に押下。pitchは±1.2以内の連続値、偶数秒の投球は狙い投げ。各操作者の入力生成用Botはその操作者のローカル予測だけを参照し、Bot本体は変更しない。ホスト1人＋1〜3クライアント。',
    '- ホストは20Hzの暫定／確定完全状態とACK範囲を配信。信頼性eventは輸送再送と受領ACKを使用。重複率2%も全条件へ加える。',
    '- 判定：配送回復後の全クライアントの確定完全状態（HP・時計・球・勝敗を含む）と連番イベント列をホストと比較。各tickの球所有者・HPの不変条件を検査。',
    '- 訂正数：state受信でローカル論理状態が変わった回数（全クライアントの合計）。予測防御の取消率・見た目の納得感はこの値だけから判断しない。',
    '- 遅着拒否：100ms超またはC未満で拒否した一意入力数。再送された同一seqの拒否を二重に数えない。',
    '- 転送量：JSONのUTF-8バイト数。入力・state・event・ACK・重複・輸送再送・回復期間を含み、各方向を1回数える。WebRTC/DTLS/SCTP/IP/TURNのヘッダーは含まない。',
    '- 再実行tick数：ホストの巻き戻し後の再計算量。壁時間は入力生成・配送・sim・検査を含む条件全体の処理時間。',
    '- RTT・ジッターは配送器へ指定した対称経路の値。時計ずれはこの行列に入れず、8標本の最小RTT選択・時刻更新後の再送固定を通常テストで検証。',
    '- Q/防御/爆発の前後1時刻単位（T10-15/19/22）、100ms境界、Bot内部記憶の再思考、旧epoch・なりすまし・異なるビルドは `tests/net/memory.test.ts` で別途検証。', '',
    `結果：${results.length}/90条件完走。確定不一致 ${total('mismatches')}、不変条件違反 ${total('invariantFailures')}、訂正 ${total('corrections')}、遅着拒否 ${total('lateRejected')}、転送 ${total('bytes')} bytes、再実行 ${total('replayedTicks')} ticks。壁時間合計 ${Math.round(performance.now() - started)}ms。`, '',
    '| 形式 | RTT ms | 損失 % | jitter ms | 確定不一致 | 不変条件違反 | 確定event | 訂正 | 遅着拒否 | UTF-8 bytes | 再実行ticks | 最大配送待ち | 壁時間ms |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|', ...rows, '',
    '資料の残課題：0010/0011の状態欄には実装・自動検証未実施の記述が残る。また0010の③にはWebRTC接続を含む。本計測は③のメモリ内部分だけで、WebRTC・シグナリング・TURN・画面接続・切断再接続は未実装。ファイル所有の指示に従い他のdocsは変更していない。', '',
  ].join('\n');
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, report, 'utf8');
  expect(results).toHaveLength(90); expect(total('mismatches')).toBe(0); expect(total('invariantFailures')).toBe(0);
  expect(results.every(r => r.events > 0)).toBe(true);
});
