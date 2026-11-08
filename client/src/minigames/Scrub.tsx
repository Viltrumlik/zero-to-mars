import { useEffect, useRef, useState, type JSX, type PointerEvent as RPointerEvent } from 'react';
import { sfx } from '../sound.ts';
import { haptic } from '../telegram.ts';
import { GameShell, L, clamp01, makeRng, pct, tr, useClock, useFx, useTimers, type Rng } from './common.tsx';
import { MINIGAME_DURATION, type MiniGameProps } from './types.ts';

const T = {
  name: L('Tozalash', 'Чистка', 'Cleaning'),
  rules: [
    L(
      "Barmog'ingizni yurgizib kirni arting.",
      'Водите пальцем, чтобы стереть грязь.',
      'Drag your finger to wipe off the grime.',
    ),
    L(
      "88% toza bo'lsa — keyingi obyekt keladi. Chetlarini ham unutmang!",
      'Чисто на 88% — привозят следующий. Не забывайте про края!',
      '88% clean and the next one rolls in. Mind the edges!',
    ),
  ],
  thick: L('Qalin kir: har bir joyni 2 marta arting.', 'Толстый слой: протирайте каждое место дважды.', 'Thick grime: every spot needs two passes.'),
  creep: L("Kir asta-sekin qaytib keladi — to'xtamang!", 'Грязь понемногу возвращается — не медлите!', 'Grime slowly creeps back — keep moving!'),
  hot: L(
    "🔥 Qizigan joylarga tegmang — kuyish jarimasi!",
    '🔥 Не трогайте раскалённые места — штраф за ожог!',
    "🔥 Don't touch the hot spots — burns cost you!",
  ),
  goal: L('{n} ta obyekt', '{n} объектов', '{n} objects'),
  car: L('Mashina', 'Машина', 'Car'),
  van: L('Furgon', 'Фургон', 'Van'),
  boiler: L('Qozon', 'Котёл', 'Boiler'),
  pipes: L('Quvurlar', 'Трубы', 'Pipes'),
  clean: L('Toza', 'Чисто', 'Clean'),
  shiny: L('Yaraqlaydi! ✨', 'Блестит! ✨', 'Sparkling! ✨'),
  burn: L('Kuydi! 🔥', 'Ожог! 🔥', 'Burn! 🔥'),
  cleaned: L('Tozalangan', 'Очищено', 'Cleaned'),
  burns: L('Kuyishlar', 'Ожоги', 'Burns'),
};

const W = 360;
const H = 240;
const DONE_AT = 0.88;
const CLEAN_ALPHA = 64; // a sample counts as clean when its dirt alpha <= 25%

type Kind = 'car' | 'van' | 'boiler' | 'pipes';
interface Hot {
  x: number;
  y: number;
  r: number;
}
interface Obj {
  id: number;
  kind: Kind;
  color: string;
  seed: number;
  hot: Hot[];
}

const CAR_COLORS = ['#ef476f', '#4cc9f0', '#ffd166', '#06d6a0', '#9b5de5', '#ff8c42', '#e9edf5'];
const METALS = ['#c8743f', '#8f9bb3', '#c9a43f', '#5f9f98'];
const EXHAUST: Hot = { x: 17, y: 182, r: 12 };
const BOILER_HOT: Hot[] = [
  { x: 304, y: 132, r: 16 },
  { x: 64, y: 178, r: 13 },
  { x: 180, y: 30, r: 12 },
];
const PIPES_HOT: Hot[] = [
  { x: 86, y: 74, r: 15 },
  { x: 274, y: 74, r: 15 },
  { x: 180, y: 74, r: 15 },
];

function makeObj(rng: Rng, d: number, id: number): Obj {
  const seed = rng.int(1, 0x7fffffff);
  if (d <= 2) {
    const kind: Kind = rng.chance(0.5) ? 'car' : 'van';
    return { id, kind, color: rng.pick(CAR_COLORS), seed, hot: d === 2 ? [EXHAUST] : [] };
  }
  const kind: Kind = rng.chance(0.5) ? 'boiler' : 'pipes';
  const hot = (kind === 'boiler' ? BOILER_HOT : PIPES_HOT).slice(0, d >= 5 ? 3 : 2);
  return { id, kind, color: rng.pick(METALS), seed, hot };
}

/* ------------------------------------------------------------ drawing */

type Ctx = CanvasRenderingContext2D;

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)),
  );
  return `rgb(${ch.join(',')})`;
}

function rrect(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + k, y);
  c.arcTo(x + w, y, x + w, y + h, k);
  c.arcTo(x + w, y + h, x, y + h, k);
  c.arcTo(x, y + h, x, y, k);
  c.arcTo(x, y, x + w, y, k);
  c.closePath();
}

function poly(c: Ctx, pts: Array<[number, number]>): void {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
}

function circle(c: Ctx, x: number, y: number, r: number, fill: string | CanvasGradient): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
}

function metalH(c: Ctx, x0: number, x1: number, base: string): CanvasGradient {
  const g = c.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, shade(base, -0.55));
  g.addColorStop(0.28, shade(base, 0.1));
  g.addColorStop(0.42, shade(base, 0.5));
  g.addColorStop(0.7, shade(base, -0.1));
  g.addColorStop(1, shade(base, -0.6));
  return g;
}

function metalV(c: Ctx, y0: number, y1: number, base: string): CanvasGradient {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, shade(base, -0.5));
  g.addColorStop(0.3, shade(base, 0.45));
  g.addColorStop(0.55, shade(base, 0.05));
  g.addColorStop(1, shade(base, -0.6));
  return g;
}

function wheel(c: Ctx, x: number, y: number): void {
  circle(c, x, y, 27, '#1b1e25');
  c.strokeStyle = '#323844';
  c.lineWidth = 3;
  c.beginPath();
  c.arc(x, y, 22, 0, Math.PI * 2);
  c.stroke();
  const g = c.createRadialGradient(x - 4, y - 4, 2, x, y, 15);
  g.addColorStop(0, '#f4f6fb');
  g.addColorStop(1, '#7d8799');
  circle(c, x, y, 15, g);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    circle(c, x + Math.cos(a) * 9, y + Math.sin(a) * 9, 2, '#4a5263');
  }
  circle(c, x, y, 4.5, '#3d4452');
}

function gauge(c: Ctx, x: number, y: number, r: number, angle: number): void {
  circle(c, x, y, r + 3, '#262b36');
  circle(c, x, y, r, '#f4f6ff');
  c.strokeStyle = '#ef476f';
  c.lineWidth = 3;
  c.beginPath();
  c.arc(x, y, r - 4, -0.4, 0.75);
  c.stroke();
  c.strokeStyle = '#3a4050';
  c.lineWidth = 1.2;
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * 0.8 + (i / 8) * Math.PI * 1.4;
    c.beginPath();
    c.moveTo(x + Math.cos(a) * (r - 2), y + Math.sin(a) * (r - 2));
    c.lineTo(x + Math.cos(a) * (r - 6), y + Math.sin(a) * (r - 6));
    c.stroke();
  }
  c.strokeStyle = '#d62f52';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + Math.cos(angle) * (r - 4), y + Math.sin(angle) * (r - 4));
  c.stroke();
  circle(c, x, y, 2.5, '#262b36');
}

function valve(c: Ctx, x: number, y: number, r: number, color: string): void {
  c.strokeStyle = shade(color, -0.35);
  c.lineWidth = 6;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = color;
  c.lineWidth = 4;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    c.stroke();
  }
  circle(c, x, y, 4, shade(color, -0.4));
}

function drawCar(c: Ctx, color: string, van: boolean): void {
  const dark = shade(color, -0.4);
  const g = c.createLinearGradient(0, 50, 0, 194);
  g.addColorStop(0, shade(color, 0.35));
  g.addColorStop(0.5, color);
  g.addColorStop(1, dark);
  // exhaust pipe (behind the body)
  rrect(c, 6, 177, 30, 10, 5);
  c.fillStyle = '#7b8494';
  c.fill();
  circle(c, 8, 182, 4, '#2a2e36');
  c.fillStyle = g;
  if (van) {
    c.beginPath();
    c.moveTo(30, 188);
    c.lineTo(30, 72);
    c.quadraticCurveTo(30, 50, 52, 50);
    c.lineTo(250, 50);
    c.quadraticCurveTo(270, 50, 280, 66);
    c.lineTo(312, 116);
    c.quadraticCurveTo(334, 122, 336, 146);
    c.lineTo(336, 176);
    c.quadraticCurveTo(336, 190, 320, 190);
    c.lineTo(44, 190);
    c.quadraticCurveTo(30, 190, 30, 176);
    c.closePath();
    c.fill();
  } else {
    c.beginPath();
    c.moveTo(94, 126);
    c.lineTo(132, 78);
    c.quadraticCurveTo(140, 68, 154, 68);
    c.lineTo(228, 68);
    c.quadraticCurveTo(242, 68, 250, 78);
    c.lineTo(290, 126);
    c.closePath();
    c.fill();
    rrect(c, 24, 116, 314, 74, 26);
    c.fill();
  }
  // windows
  const wg = c.createLinearGradient(0, 60, 0, 120);
  wg.addColorStop(0, '#d6f3ff');
  wg.addColorStop(1, '#4f9fd0');
  c.fillStyle = wg;
  if (van) {
    rrect(c, 46, 64, 72, 46, 9);
    c.fill();
    rrect(c, 128, 64, 72, 46, 9);
    c.fill();
    poly(c, [
      [210, 64],
      [258, 64],
      [296, 112],
      [210, 112],
    ]);
    c.fill();
  } else {
    poly(c, [
      [108, 122],
      [140, 82],
      [188, 82],
      [188, 122],
    ]);
    c.fill();
    poly(c, [
      [196, 122],
      [196, 82],
      [240, 82],
      [272, 122],
    ]);
    c.fill();
  }
  // glass shine
  c.save();
  c.globalAlpha = 0.35;
  c.strokeStyle = '#ffffff';
  c.lineWidth = 6;
  c.beginPath();
  if (van) {
    c.moveTo(60, 104);
    c.lineTo(84, 70);
    c.moveTo(142, 104);
    c.lineTo(166, 70);
  } else {
    c.moveTo(150, 116);
    c.lineTo(172, 88);
    c.moveTo(214, 116);
    c.lineTo(234, 90);
  }
  c.stroke();
  c.restore();
  // seams + handles
  c.strokeStyle = dark;
  c.lineWidth = 2;
  c.beginPath();
  if (van) {
    c.moveTo(205, 60);
    c.lineTo(205, 182);
    c.moveTo(123, 60);
    c.lineTo(123, 182);
  } else {
    c.moveTo(192, 84);
    c.lineTo(192, 180);
    c.moveTo(110, 128);
    c.lineTo(110, 178);
  }
  c.moveTo(34, 140);
  c.lineTo(330, 140);
  c.stroke();
  c.fillStyle = shade(color, -0.55);
  rrect(c, van ? 182 : 168, 146, 16, 5, 2.5);
  c.fill();
  rrect(c, van ? 104 : 250, 146, 16, 5, 2.5);
  c.fill();
  // lights + bumpers
  c.fillStyle = '#fff3b0';
  c.beginPath();
  c.ellipse(330, 138, 6, 10, 0, 0, Math.PI * 2);
  c.fill();
  rrect(c, 26, 128, 8, 20, 3);
  c.fillStyle = '#ff4d6d';
  c.fill();
  c.fillStyle = '#353a46';
  rrect(c, 20, 168, 44, 14, 7);
  c.fill();
  rrect(c, 302, 168, 42, 14, 7);
  c.fill();
  // wheel arches + wheels
  for (const x of [96, 266]) {
    c.fillStyle = '#121419';
    c.beginPath();
    c.arc(x, 190, 33, Math.PI, 0);
    c.fill();
    wheel(c, x, 190);
  }
}

function drawBoiler(c: Ctx, base: string): void {
  const pipe = '#8c96a8';
  // left flue pipe
  c.fillStyle = metalH(c, 56, 72, pipe);
  c.fillRect(56, 34, 16, 146);
  c.fillStyle = metalV(c, 170, 186, pipe);
  c.fillRect(64, 170, 60, 16);
  circle(c, 64, 178, 11, shade(pipe, -0.2));
  rrect(c, 46, 22, 36, 14, 4);
  c.fillStyle = shade(pipe, -0.35);
  c.fill();
  // right steam pipe
  c.fillStyle = metalV(c, 66, 82, pipe);
  c.fillRect(236, 66, 70, 16);
  c.fillStyle = metalH(c, 296, 312, pipe);
  c.fillRect(296, 74, 16, 136);
  circle(c, 304, 74, 11, shade(pipe, -0.2));
  rrect(c, 290, 204, 28, 10, 3);
  c.fillStyle = '#3a404d';
  c.fill();
  // base + legs
  c.fillStyle = '#2b303b';
  c.fillRect(136, 196, 14, 14);
  c.fillRect(210, 196, 14, 14);
  rrect(c, 122, 206, 116, 12, 5);
  c.fill();
  // tank
  c.fillStyle = metalH(c, 118, 242, base);
  rrect(c, 118, 46, 124, 158, 24);
  c.fill();
  c.fillStyle = metalH(c, 118, 242, shade(base, 0.15));
  c.beginPath();
  c.ellipse(180, 50, 62, 16, 0, 0, Math.PI * 2);
  c.fill();
  // top valve
  c.fillStyle = metalH(c, 172, 188, pipe);
  c.fillRect(172, 24, 16, 22);
  rrect(c, 166, 18, 28, 9, 3);
  c.fillStyle = '#ef476f';
  c.fill();
  // bands + rivets
  for (const y of [90, 162]) {
    c.fillStyle = metalH(c, 118, 242, shade(base, -0.25));
    c.fillRect(118, y, 124, 9);
    for (let x = 126; x < 240; x += 13) circle(c, x, y + 4.5, 1.8, shade(base, 0.55));
  }
  gauge(c, 180, 126, 19, -0.2);
  // nameplate
  rrect(c, 150, 176, 60, 16, 4);
  c.fillStyle = '#d9b44a';
  c.fill();
  c.fillStyle = '#4a3a10';
  c.font = 'bold 9px system-ui, sans-serif';
  c.textAlign = 'center';
  c.fillText('PRESSURE', 180, 187);
  valve(c, 304, 132, 15, '#ef476f');
}

function drawPipes(c: Ctx, base: string): void {
  const pipe = shade(base, -0.05);
  // header pipe across the top
  c.fillStyle = metalV(c, 18, 36, pipe);
  rrect(c, 70, 18, 222, 18, 9);
  c.fill();
  const xs = [86, 180, 274];
  for (const x of xs) {
    c.fillStyle = metalH(c, x - 9, x + 9, pipe);
    c.fillRect(x - 9, 26, 18, 106);
    for (const y of [42, 112]) {
      c.fillStyle = metalH(c, x - 15, x + 15, shade(pipe, -0.2));
      rrect(c, x - 15, y, 30, 9, 3);
      c.fill();
    }
  }
  // tank
  c.fillStyle = metalV(c, 122, 194, base);
  rrect(c, 30, 122, 300, 72, 36);
  c.fill();
  for (const y of [134, 182]) for (let x = 60; x < 304; x += 16) circle(c, x, y, 1.8, shade(base, 0.55));
  // feet
  c.fillStyle = '#2b303b';
  c.fillRect(74, 190, 18, 18);
  c.fillRect(268, 190, 18, 18);
  rrect(c, 52, 204, 256, 12, 5);
  c.fill();
  gauge(c, 130, 158, 16, 0.3);
  gauge(c, 230, 158, 16, -0.9);
  const colors = ['#ef476f', '#ffd166', '#4cc9f0'];
  xs.forEach((x, i) => valve(c, x, 74, 14, colors[i]!));
}

function drawObject(c: Ctx, o: Obj): void {
  if (o.kind === 'car' || o.kind === 'van') drawCar(c, o.color, o.kind === 'van');
  else if (o.kind === 'boiler') drawBoiler(c, o.color);
  else drawPipes(c, o.color);
}

function paintDirt(c: Ctx, rng: Rng, soot: boolean, thick: boolean): void {
  const base = soot ? [60, 54, 48] : [104, 78, 50];
  const dk = thick ? -16 : 0;
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  c.fillStyle = `rgb(${base.map((v) => cl(v + dk)).join(',')})`;
  c.fillRect(0, 0, W, H);
  const blobs = thick ? 190 : 140;
  for (let i = 0; i < blobs; i++) {
    const x = rng.next() * W;
    const y = rng.next() * H;
    const r = 6 + rng.next() * 34;
    const k = (rng.next() - 0.5) * 70 + dk;
    let col = base.map((v) => cl(v + k));
    if (soot && rng.chance(0.25)) col = [cl(140 + k), cl(72 + k / 2), 30];
    if (!soot && rng.chance(0.2)) col = [cl(82 + k), cl(88 + k), 50];
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${col.join(',')},${(0.35 + rng.next() * 0.45).toFixed(2)})`);
    g.addColorStop(1, `rgba(${col.join(',')},0)`);
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 520; i++) {
    const s = 1 + rng.next() * 2;
    c.fillStyle = rng.chance(0.7) ? 'rgba(20,14,8,0.55)' : 'rgba(210,190,160,0.35)';
    c.fillRect(rng.next() * W, rng.next() * H, s, s);
  }
  c.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const x = rng.next() * W;
    const y = rng.next() * H * 0.7;
    c.strokeStyle = `rgba(${soot ? '15,12,10' : '45,30,16'},0.45)`;
    c.lineWidth = 2 + rng.next() * 4;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + (rng.next() - 0.5) * 6, y + 18 + rng.next() * 46);
    c.stroke();
  }
}

/* ------------------------------------------------------------ game */

type Trans = null | 'clean' | 'out';

export function ScrubGame({ difficulty: d, lang, seed, title, onDone, onQuit }: MiniGameProps): JSX.Element {
  const clock = useClock(MINIGAME_DURATION(d));
  const fx = useFx();
  const timers = useTimers();
  const [rng] = useState(() => makeRng(seed ^ 0x5c7b0a11));
  const target = 2 + Math.floor(d / 2);
  const thick = d >= 4;
  const creepMs = d >= 5 ? (d === 5 ? 900 : 650) : 0;
  const brush = [17, 17, 17, 18, 18, 18][d - 1]!;
  const strength = thick ? 0.22 : 0.5;
  const pen = 0.08;

  const [obj, setObj] = useState<Obj>(() => makeObj(rng, d, 0));
  const [clean, setClean] = useState(0);
  const [done, setDone] = useState(0);
  const [burns, setBurns] = useState(0);
  const [trans, setTrans] = useState<Trans>(null);
  const [hotHit, setHotHit] = useState<{ i: number; k: number } | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const dirtRef = useRef<HTMLCanvasElement>(null);
  const spongeRef = useRef<HTMLDivElement>(null);
  const bubblesRef = useRef<HTMLDivElement>(null);
  const g = useRef({
    dc: null as Ctx | null,
    mask: null as HTMLCanvasElement | null,
    tex: null as HTMLCanvasElement | null,
    samples: [] as number[],
    data: null as Uint8ClampedArray | null,
    drawing: false,
    pointer: -1,
    last: { x: 0, y: 0 },
    carry: 0,
    lastCheck: 0,
    pending: false,
    lastBurn: 0,
    stamps: 0,
    trans: null as Trans,
    phase: clock.phase,
    hitK: 0,
  });
  g.current.phase = clock.phase;
  g.current.trans = trans;
  const started = clock.phase !== 'intro';

  /* Paint the object, build the mask and lay the dirt on top. */
  useEffect(() => {
    const base = baseRef.current;
    const dirt = dirtRef.current;
    if (!started || !base || !dirt) return;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    base.width = Math.round(W * dpr);
    base.height = Math.round(H * dpr);
    const bc = base.getContext('2d')!;
    bc.setTransform(dpr, 0, 0, dpr, 0, 0);
    bc.clearRect(0, 0, W, H);
    drawObject(bc, obj);

    const mask = document.createElement('canvas');
    mask.width = W;
    mask.height = H;
    const mc = mask.getContext('2d', { willReadFrequently: true })!;
    mc.drawImage(base, 0, 0, W, H);
    mc.globalCompositeOperation = 'destination-out';
    for (const h of obj.hot) {
      mc.beginPath();
      mc.arc(h.x, h.y, h.r + 3, 0, Math.PI * 2);
      mc.fill();
    }

    const tex = document.createElement('canvas');
    tex.width = W;
    tex.height = H;
    paintDirt(tex.getContext('2d')!, makeRng(obj.seed), obj.kind === 'boiler' || obj.kind === 'pipes', thick);

    dirt.width = W;
    dirt.height = H;
    const dc = dirt.getContext('2d', { willReadFrequently: true })!;
    dc.globalCompositeOperation = 'source-over';
    dc.globalAlpha = 1;
    dc.drawImage(tex, 0, 0);
    dc.globalCompositeOperation = 'destination-in';
    dc.drawImage(mask, 0, 0);
    dc.globalCompositeOperation = 'source-over';

    const md = mc.getImageData(0, 0, W, H).data;
    const samples: number[] = [];
    for (let y = 3; y < H; y += 6) for (let x = 3; x < W; x += 6) if (md[(y * W + x) * 4 + 3]! > 160) samples.push((y * W + x) * 4 + 3);

    Object.assign(g.current, { dc, mask, tex, samples, data: dc.getImageData(0, 0, W, H).data, drawing: false });
    setClean(0);
  }, [obj, started, thick]);

  const measure = (): number => {
    const s = g.current;
    if (!s.dc || !s.samples.length) return 0;
    const data = s.dc.getImageData(0, 0, W, H).data;
    s.data = data;
    let n = 0;
    for (const i of s.samples) if (data[i]! <= CLEAN_ALPHA) n++;
    return n / s.samples.length;
  };

  const complete = () => {
    const s = g.current;
    s.trans = 'clean';
    s.drawing = false;
    spongeRef.current?.classList.remove('on');
    setTrans('clean');
    setClean(1);
    setDone((v) => v + 1);
    sfx.success();
    haptic('success');
    fx.flash('ok');
    fx.float(`+1 ${tr(T.shiny, lang)}`, 'ok', 50, 46);
    timers.after(700, () => setTrans('out'));
    timers.after(1100, () => {
      setObj((o) => makeObj(rng, d, o.id + 1));
      g.current.trans = null;
      setTrans(null);
    });
  };

  const check = () => {
    const s = g.current;
    if (s.trans || s.phase !== 'play') return;
    s.lastCheck = performance.now();
    const f = measure();
    setClean(f);
    if (f >= DONE_AT) complete();
  };

  const burn = (i: number) => {
    const s = g.current;
    const now = performance.now();
    if (now - s.lastBurn < 900) return;
    s.lastBurn = now;
    s.hitK += 1;
    const k = s.hitK;
    setBurns((b) => b + 1);
    setHotHit({ i, k });
    timers.after(700, () => setHotHit((h) => (h && h.k === k ? null : h)));
    sfx.error();
    haptic('error');
    fx.flash('bad');
    fx.float(`${tr(T.burn, lang)} −${pct(pen)}`, 'bad', 50, 46);
  };

  const bubble = (cssX: number, cssY: number) => {
    const layer = bubblesRef.current;
    if (!layer || layer.childElementCount > 14) return;
    const b = document.createElement('span');
    b.className = 'mg-bubble-dot';
    const size = 6 + Math.random() * 12;
    b.style.cssText = `left:${cssX + (Math.random() - 0.5) * 30}px;top:${cssY + (Math.random() - 0.5) * 30}px;width:${size}px;height:${size}px`;
    b.addEventListener('animationend', () => b.remove());
    layer.appendChild(b);
  };

  const stamp = (x: number, y: number) => {
    const s = g.current;
    const dc = s.dc;
    if (!dc) return;
    dc.globalCompositeOperation = 'destination-out';
    dc.globalAlpha = strength;
    dc.beginPath();
    dc.arc(x, y, brush, 0, Math.PI * 2);
    dc.fill();
    dc.globalAlpha = 1;
    dc.globalCompositeOperation = 'source-over';
    obj.hot.forEach((h, i) => {
      if (Math.hypot(x - h.x, y - h.y) < h.r + brush * 0.5) burn(i);
    });
  };

  const toLocal = (e: RPointerEvent) => {
    const r = stageRef.current!.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    return { x: (cx / r.width) * W, y: (cy / r.height) * H, cx, cy };
  };

  const moveSponge = (cx: number, cy: number) => {
    const sp = spongeRef.current;
    if (sp) sp.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
  };

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (s.phase !== 'play' || s.trans || !s.dc) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    s.drawing = true;
    s.pointer = e.pointerId;
    const p = toLocal(e);
    s.last = { x: p.x, y: p.y };
    s.carry = 0;
    stamp(p.x, p.y);
    moveSponge(p.cx, p.cy);
    spongeRef.current?.classList.add('on');
    haptic('light');
  };

  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (!s.drawing || e.pointerId !== s.pointer) return;
    if (s.phase !== 'play' || s.trans) {
      s.drawing = false;
      return;
    }
    const p = toLocal(e);
    moveSponge(p.cx, p.cy);
    const dx = p.x - s.last.x;
    const dy = p.y - s.last.y;
    const dist = Math.hypot(dx, dy);
    const step = brush / 2;
    let t = step - s.carry;
    while (t <= dist) {
      stamp(s.last.x + (dx * t) / dist, s.last.y + (dy * t) / dist);
      s.stamps++;
      t += step;
    }
    s.carry = dist - (t - step);
    s.last = { x: p.x, y: p.y };
    if (s.stamps % 6 === 0 && dist > 2) bubble(p.cx, p.cy);
    if (performance.now() - s.lastCheck > 120) check();
    else if (!s.pending) {
      // trailing check so the last bit of a fast stroke is always measured
      s.pending = true;
      timers.after(140, () => {
        g.current.pending = false;
        check();
      });
    }
  };

  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (e.pointerId !== s.pointer) return;
    s.drawing = false;
    s.pointer = -1;
    spongeRef.current?.classList.remove('on');
    check();
  };

  /* Grime creeping back on the cleaned parts. */
  useEffect(() => {
    if (!creepMs || clock.phase !== 'play') return;
    const id = window.setInterval(() => {
      const s = g.current;
      if (s.trans || !s.dc || !s.data || !s.mask || !s.tex || !s.samples.length) return;
      const pat = s.dc.createPattern(s.tex, 'no-repeat');
      if (!pat) return;
      let grew = false;
      for (let k = 0; k < 2; k++) {
        for (let tries = 0; tries < 14; tries++) {
          const i = s.samples[Math.floor(Math.random() * s.samples.length)]!;
          if (s.data[i]! > CLEAN_ALPHA) continue;
          const px = (i - 3) / 4;
          const x = px % W;
          const y = Math.floor(px / W);
          s.dc.globalCompositeOperation = 'source-over';
          s.dc.globalAlpha = 0.7;
          s.dc.fillStyle = pat;
          s.dc.beginPath();
          s.dc.arc(x, y, 9 + Math.random() * 7, 0, Math.PI * 2);
          s.dc.fill();
          grew = true;
          break;
        }
      }
      if (!grew) return;
      s.dc.globalAlpha = 1;
      s.dc.globalCompositeOperation = 'destination-in';
      s.dc.drawImage(s.mask, 0, 0);
      s.dc.globalCompositeOperation = 'source-over';
      check();
    }, creepMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creepMs, clock.phase]);

  useEffect(() => {
    if (clock.phase === 'over') {
      g.current.drawing = false;
      spongeRef.current?.classList.remove('on');
    }
  }, [clock.phase]);

  const partial = trans ? 0 : Math.min(0.99, clean / DONE_AT);
  const score = clamp01(Math.min(1, (done + partial) / target) - burns * pen);
  const rules = [...T.rules, ...(thick ? [T.thick] : []), ...(creepMs ? [T.creep] : []), ...(d >= 2 ? [T.hot] : [])];
  const isCar = obj.kind === 'car' || obj.kind === 'van';
  const objName = `${isCar ? '🚗' : '🔥'} ${tr(T[obj.kind], lang)} #${obj.id + 1}`;
  const tip = obj.hot.length ? tr(T.hot, lang) : thick ? tr(T.thick, lang) : tr(T.rules[1]!, lang);

  return (
    <GameShell
      lang={lang}
      title={title}
      difficulty={d}
      theme="scrub"
      icon={d <= 2 ? '🧽' : '🧯'}
      name={T.name}
      rules={rules}
      goal={tr(T.goal, lang, { n: target })}
      clock={clock}
      fx={fx.node}
      score={score}
      breakdown={[
        [`✨ ${tr(T.cleaned, lang)}`, `${done} / ${target}`],
        [`🔥 ${tr(T.burns, lang)}`, burns ? `${burns} (−${pct(burns * pen)})` : '0'],
      ]}
      hud={
        <>
          <span className="mg-chip">
            ✨ {done}/{target}
          </span>
          {burns > 0 && <span className="mg-chip mg-chip-bad">🔥{burns}</span>}
        </>
      }
      onDone={onDone}
      onQuit={onQuit}
    >
      <div className="mg-scrub">
        <div className="mg-scrub-info">
          <b>{objName}</b>
          <div className="mg-cleanbar">
            <div className="mg-cleanbar-fill" style={{ transform: `scaleX(${Math.min(1, clean)})` }} />
            <i style={{ left: `${DONE_AT * 100}%` }} />
          </div>
          <span className={clean >= DONE_AT ? 'mg-good' : ''}>{Math.floor(clean * 100)}%</span>
        </div>
        <div className={`mg-stage-wrap ${isCar ? 'mg-bay-car' : 'mg-bay-boiler'}`}>
          <div
            key={obj.id}
            ref={stageRef}
            className={`mg-stage ${trans === 'out' ? 'mg-stage-out' : ''} ${trans === 'clean' ? 'mg-stage-clean' : ''}`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onLostPointerCapture={onUp}
          >
            <div className="mg-obj-shadow" />
            <canvas ref={baseRef} className="mg-cv" />
            <canvas ref={dirtRef} className="mg-cv mg-dirt" />
            {obj.hot.map((h, i) => (
              <div
                key={i}
                className={`mg-hot ${hotHit && hotHit.i === i ? 'mg-hot-hit' : ''}`}
                style={{
                  left: `${(h.x / W) * 100}%`,
                  top: `${(h.y / H) * 100}%`,
                  width: `${((h.r * 2) / W) * 100}%`,
                }}
              />
            ))}
            <div ref={bubblesRef} className="mg-bubbles" />
            {trans === 'clean' && (
              <div className="mg-sparkles">
                {['12%,30%', '78%,22%', '40%,62%', '86%,70%', '24%,80%', '60%,18%'].map((p, i) => {
                  const [l, t] = p.split(',');
                  return (
                    <span key={i} style={{ left: l, top: t, animationDelay: `${i * 60}ms` }}>
                      ✨
                    </span>
                  );
                })}
              </div>
            )}
            <div ref={spongeRef} className="mg-sponge">
              🧽
            </div>
          </div>
        </div>
        <p className="mg-tip">{tip}</p>
      </div>
    </GameShell>
  );
}
