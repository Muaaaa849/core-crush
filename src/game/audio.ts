// WebAudioの出力（0012「WebAudio合成SE」）。音色の記述（sound.ts）をノードへ変換し、同時8音・総音量の上限を守る。
import type { SoundPlan } from './sound';

export const MASTER_GAIN_LIMIT = 0.25;
const MAX_SOUNDS = 8;
const FADE = 0.005; // 置換・停止時の減衰（秒）
const ATTACK = 0.003;

interface Playing { sources: AudioScheduledSourceNode[]; nodes: AudioNode[]; gain: GainNode; endsAt: number }

/** 明示的な操作（start）でだけAudioContextを作る・再開する。失敗はstatusで伝え、同じ操作で再試行できる。 */
export function createAudioOutput(createContext: () => AudioContext = () => new AudioContext()) {
  let ctx: AudioContext | undefined, master: GainNode | undefined, noise: AudioBuffer | undefined;
  let status = '', volume = 1, muted = false;
  let playing: Playing[] = [];

  const level = () => muted ? 0 : Math.min(1, Math.max(0, volume)) * MASTER_GAIN_LIMIT;
  const fadeOut = (sound: Playing) => {
    const now = ctx!.currentTime;
    sound.gain.gain.cancelScheduledValues(now);
    sound.gain.gain.setValueAtTime(sound.gain.gain.value, now);
    sound.gain.gain.linearRampToValueAtTime(0, now + FADE);
    for (const s of sound.sources) s.stop(Math.min(sound.endsAt, now + FADE));
  };
  const stopAll = () => { for (const sound of playing) fadeOut(sound); playing = []; };

  return {
    get ready() { return ctx?.state === 'running'; },
    get status() { return status; },
    get activeCount() { return playing.length; },
    async start(): Promise<boolean> {
      try {
        if (!ctx) {
          ctx = createContext();
          master = ctx.createGain();
          master.gain.setValueAtTime(level(), ctx.currentTime);
          master.connect(ctx.destination);
          ctx.addEventListener('statechange', () => {
            if (ctx!.state === 'running') return;
            stopAll(); status = '音声が止まりました。もう一度クリックで再試行';
          });
        }
        await ctx.resume();
        if (!noise) {
          // 固定seedの短いノイズを一度だけ作って共有する（simの乱数は使わない）。
          noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.25), ctx.sampleRate);
          const data = noise.getChannelData(0);
          let seed = 1;
          for (let i = 0; i < data.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; data[i] = seed / 2 ** 31 - 1; }
        }
        status = '';
        return true;
      } catch (error) {
        status = `音声を開始できません（${(error as Error).message}）。もう一度クリックで再試行`;
        return false;
      }
    },
    setVolume(nextVolume: number, nextMuted: boolean) {
      volume = nextVolume; muted = nextMuted;
      if (!ctx || !master) return;
      master.gain.setValueAtTime(level(), ctx.currentTime);
      if (muted) stopAll();
    },
    play(plan: SoundPlan) {
      if (!ctx || !master || !noise || ctx.state !== 'running' || muted) return;
      if (playing.length >= MAX_SOUNDS) fadeOut(playing.shift()!);
      const t = ctx.currentTime;
      const panner = ctx.createStereoPanner(), gain = ctx.createGain();
      panner.pan.setValueAtTime(plan.pan, t);
      gain.gain.setValueAtTime(plan.gain, t);
      gain.connect(panner); panner.connect(master);
      const sound: Playing = { sources: [], nodes: [gain, panner], gain, endsAt: t + plan.durationMs / 1000 };
      for (const v of plan.voices) {
        const start = t + v.startMs / 1000, end = start + v.durationMs / 1000;
        let source: AudioScheduledSourceNode;
        if (v.wave === 'noise') {
          const buffer = ctx.createBufferSource(); buffer.buffer = noise; source = buffer;
        } else {
          const osc = ctx.createOscillator(); osc.type = v.wave;
          osc.frequency.setValueAtTime(v.fromHz, start);
          if (v.toHz !== v.fromHz) osc.frequency.exponentialRampToValueAtTime(v.toHz, end);
          source = osc;
        }
        const envelope = ctx.createGain();
        envelope.gain.setValueAtTime(0, start);
        envelope.gain.linearRampToValueAtTime(v.gain, start + ATTACK);
        envelope.gain.linearRampToValueAtTime(0, end);
        let tail: AudioNode = source;
        if (v.filter) {
          const filter = ctx.createBiquadFilter();
          filter.type = v.filter.type; filter.frequency.setValueAtTime(v.filter.hz, start); filter.Q.setValueAtTime(v.filter.q, start);
          tail.connect(filter); tail = filter; sound.nodes.push(filter);
        }
        tail.connect(envelope); envelope.connect(gain);
        sound.nodes.push(source, envelope); sound.sources.push(source);
        source.start(start); source.stop(end);
      }
      // 全ての発音源が終わったらノードを切り離す（置換・停止された音も同じ）。
      let remaining = sound.sources.length;
      for (const s of sound.sources) s.onended = () => {
        if (--remaining) return;
        for (const node of sound.nodes) node.disconnect();
        playing = playing.filter(p => p !== sound);
      };
      playing.push(sound);
    },
    stop: stopAll,
  };
}
