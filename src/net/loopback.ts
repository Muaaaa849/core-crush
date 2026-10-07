// M0：同一ページ内の接続だけを検証する。対戦同期はM2。
import { channelOptions, summarizeRtt, validatePingCount } from './metrics';

const form = document.querySelector<HTMLFormElement>('#measure')!;
const countInput = document.querySelector<HTMLInputElement>('#count')!;
const button = document.querySelector<HTMLButtonElement>('#start')!;
const status = document.querySelector<HTMLElement>('#status')!;
const output = document.querySelector<HTMLElement>('#results')!;
const PING_TIMEOUT_MS = 1000;

type ChannelResult = ReturnType<typeof summarizeRtt> & {
  ordered: boolean;
  maxRetransmits: number | null;
  maxPacketLifeTime: number | null;
};

interface NetReport {
  status: 'running' | 'complete' | 'error';
  count: number;
  pingTimeoutMs: number;
  channels: Partial<Record<keyof typeof channelOptions, ChannelResult>>;
  error?: string;
}

declare global {
  interface Window { __corecrushNet?: NetReport }
}

function publish(report: NetReport): void {
  window.__corecrushNet = report;
  output.textContent = JSON.stringify(report, null, 2);
}

async function waitFor(ready: () => boolean, label: string): Promise<void> {
  const deadline = performance.now() + 15_000;
  while (!ready()) {
    if (performance.now() >= deadline) throw new Error(`${label}がタイムアウトしました。`);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
  }
}

function ping(channel: RTCDataChannel, id: number): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const message = String(id);
    const started = performance.now();
    const finish = (sample: number | null, error?: Error) => {
      window.clearTimeout(timer);
      channel.removeEventListener('message', onMessage);
      channel.removeEventListener('close', onClose);
      channel.removeEventListener('error', onClose);
      if (error) reject(error);
      else resolve(sample);
    };
    const onMessage = (event: MessageEvent) => {
      // 遅れて届いた前のpingの応答を次の標本に混ぜない。
      if (event.data === message) finish(performance.now() - started);
    };
    const onClose = () => finish(null, new Error(`${channel.label}が切断されました。`));
    const timer = window.setTimeout(() => finish(null), PING_TIMEOUT_MS);
    channel.addEventListener('message', onMessage);
    channel.addEventListener('close', onClose);
    channel.addEventListener('error', onClose);
    try {
      channel.send(message);
    } catch (error) {
      finish(null, error instanceof Error ? error : new Error(String(error)));
    }
  });
}

async function measure(count: number, report: NetReport): Promise<void> {
  const sender = new RTCPeerConnection({ iceServers: [] });
  const receiver = new RTCPeerConnection({ iceServers: [] });
  const close = () => { sender.close(); receiver.close(); };
  window.addEventListener('pagehide', close);
  try {
    const echoes: RTCDataChannel[] = [];
    receiver.ondatachannel = ({ channel }) => {
      echoes.push(channel);
      channel.onmessage = ({ data }) => {
        if (channel.readyState === 'open') channel.send(data);
      };
    };
    const channels = {
      state: sender.createDataChannel('state', channelOptions.state),
      event: sender.createDataChannel('event', channelOptions.event),
    };

    // ICE収集完了後のSDPをそのまま渡すので候補の別送・サーバーは不要。
    await sender.setLocalDescription(await sender.createOffer());
    await waitFor(() => sender.iceGatheringState === 'complete', '送信側のICE収集');
    await receiver.setRemoteDescription(sender.localDescription!);
    await receiver.setLocalDescription(await receiver.createAnswer());
    await waitFor(() => receiver.iceGatheringState === 'complete', '受信側のICE収集');
    await sender.setRemoteDescription(receiver.localDescription!);
    await waitFor(() => Object.values(channels).every((channel) => channel.readyState === 'open')
      && echoes.length === 2 && echoes.every((channel) => channel.readyState === 'open'), 'チャンネル接続');

    for (const name of ['state', 'event'] as const) {
      const channel = channels[name];
      const samples: number[] = [];
      for (let i = 0; i < count; i++) {
        status.textContent = `${name}: ${i + 1}/${count} 回を計測中`;
        const sample = await ping(channel, i);
        if (sample !== null) samples.push(sample);
      }
      report.channels[name] = {
        ...summarizeRtt(count, samples),
        ordered: channel.ordered,
        maxRetransmits: channel.maxRetransmits,
        maxPacketLifeTime: channel.maxPacketLifeTime,
      };
      publish(report);
    }
  } finally {
    close();
    window.removeEventListener('pagehide', close);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (button.disabled) return;
  let count: number;
  try {
    count = validatePingCount(countInput.valueAsNumber);
  } catch (error) {
    status.textContent = String(error);
    return;
  }
  button.disabled = true;
  const report: NetReport = { status: 'running', count, pingTimeoutMs: PING_TIMEOUT_MS, channels: {} };
  publish(report);
  status.textContent = 'ページ内の2つの接続を準備中…';
  try {
    await measure(count, report);
    report.status = 'complete';
    status.textContent = '計測完了（RTTのp50/p95はms、応答分のみ）';
  } catch (error) {
    report.status = 'error';
    report.error = error instanceof Error ? error.message : String(error);
    status.textContent = `計測失敗: ${report.error}`;
  } finally {
    publish(report);
    button.disabled = false;
  }
});
