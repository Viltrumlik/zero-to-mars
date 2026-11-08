/** Tiny synthesized sound effects (no audio files to download). */

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.06, delay = 0, slide = 0): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, gain = 0.15): void {
  const c = ac();
  if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = c.createBufferSource();
  const g = c.createGain();
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 900;
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(f).connect(g).connect(c.destination);
  src.start();
}

export const sfx = {
  tap: () => tone(620 + Math.random() * 160, 0.07, 'triangle', 0.035, 0, 240),
  buy: () => {
    tone(523, 0.09, 'triangle', 0.05);
    tone(784, 0.14, 'triangle', 0.05, 0.08);
  },
  error: () => tone(180, 0.18, 'square', 0.03, 0, -60),
  event: () => {
    tone(880, 0.25, 'sine', 0.05);
    tone(1320, 0.35, 'sine', 0.03, 0.12);
  },
  success: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.05, i * 0.09)),
  fail: () => {
    noise(0.9, 0.25);
    tone(110, 0.6, 'sawtooth', 0.04, 0, -60);
  },
  launch: () => noise(2.2, 0.12),
  coins: () => [1200, 1500, 1800].forEach((f, i) => tone(f, 0.08, 'square', 0.02, i * 0.05)),
};
