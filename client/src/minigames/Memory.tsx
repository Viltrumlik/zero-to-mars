import { useEffect, useRef, useState, type CSSProperties, type JSX } from 'react';
import { sfx } from '../sound.ts';
import { haptic } from '../telegram.ts';
import { GameShell, L, clamp01, makeRng, pct, tr, useBump, useClock, useFx, useTimers } from './common.tsx';
import { MINIGAME_DURATION, type MiniGameProps } from './types.ts';

const T = {
  name: L('Diagnostika', 'Диагностика', 'Diagnostics'),
  rules: [
    L(
      'Platadagi detallar navbat bilan yonadi — tartibini eslab qoling.',
      'Детали на плате вспыхивают по очереди — запомните порядок.',
      'Parts on the board light up one by one — memorize the order.',
    ),
    L(
      "So'ng ularni xuddi shu tartibda bosing. Har bir to'g'ri raund zanjirni uzaytiradi.",
      'Затем нажмите их в том же порядке. Каждый верный раунд удлиняет цепочку.',
      'Then tap them in the same order. Every correct round makes the chain longer.',
    ),
    L(
      'Xato — jarima va yangi, qisqaroq zanjir.',
      'Ошибка — штраф и новая, более короткая цепочка.',
      'A mistake costs you and starts a new, shorter chain.',
    ),
  ],
  goal: L('{n} raund', '{n} раундов', '{n} rounds'),
  watch: L('Kuzating', 'Смотрите', 'Watch'),
  turn: L('Navbatingiz', 'Ваш ход', 'Your turn'),
  ok: L("To'g'ri!", 'Верно!', 'Correct!'),
  bad: L('Xato!', 'Ошибка!', 'Wrong!'),
  rounds: L('Raundlar', 'Раунды', 'Rounds'),
  best: L('Eng uzun zanjir', 'Самая длинная цепочка', 'Longest chain'),
  mistakes: L('Xatolar', 'Ошибки', 'Mistakes'),
  chain: L('Zanjir', 'Цепочка', 'Chain'),
  tip: L("Diqqat bilan kuzating!", 'Следите внимательно!', 'Watch closely!'),
};

const PARTS = [
  { emoji: '🧠', color: '#4cc9f0', tag: 'U1' },
  { emoji: '💾', color: '#06d6a0', tag: 'M2' },
  { emoji: '🔋', color: '#ffd166', tag: 'P3' },
  { emoji: '📡', color: '#9b5de5', tag: 'N4' },
  { emoji: '🌀', color: '#ff8c42', tag: 'F5' },
  { emoji: '💡', color: '#ef476f', tag: 'D6' },
  { emoji: '🧲', color: '#ff6ec7', tag: 'L7' },
];

const ON_MS = [520, 440, 380, 320, 260, 210];
const GAP_MS = [220, 180, 150, 130, 110, 90];
const START_LEN = 3;

type Mode = 'idle' | 'show' | 'input' | 'ok' | 'bad';

export function MemoryGame({ difficulty: d, lang, seed, title, onDone, onQuit }: MiniGameProps): JSX.Element {
  const clock = useClock(MINIGAME_DURATION(d));
  const fx = useFx();
  const timers = useTimers();
  const play = useTimers();
  const [rng] = useState(() => makeRng(seed ^ 0x3e3021a7));
  const n = [4, 5, 5, 6, 6, 7][d - 1]!;
  const target = 3 + d;
  const pen = 0.1;
  const onMs = ON_MS[d - 1]!;
  const gapMs = GAP_MS[d - 1]!;

  const [seq, setSeq] = useState<number[]>([]);
  const [pos, setPos] = useState(0);
  const [shown, setShown] = useState(0);
  const [mode, setMode] = useState<Mode>('idle');
  const [lit, setLit] = useState<number | null>(null);
  const [pressed, setPressed] = useState<{ i: number; k: number; ok: boolean } | null>(null);
  const [rounds, setRounds] = useState(0);
  const [best, setBest] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [shake, bumpShake] = useBump();
  const pressK = useRef(0);
  const phaseRef = useRef(clock.phase);
  phaseRef.current = clock.phase;

  const nextPart = (prev: number[]): number => {
    for (;;) {
      const p = rng.int(0, n - 1);
      const l = prev.length;
      if (l >= 2 && prev[l - 1] === p && prev[l - 2] === p) continue;
      return p;
    }
  };
  const fresh = (len: number): number[] => {
    const out: number[] = [];
    while (out.length < len) out.push(nextPart(out));
    return out;
  };

  const startSeq = (s: number[], delay: number) => {
    if (phaseRef.current !== 'play') return;
    play.clear();
    setSeq(s);
    setPos(0);
    setShown(0);
    setLit(null);
    setMode('show');
    const step = onMs + gapMs;
    s.forEach((p, i) => {
      play.after(delay + i * step, () => {
        setLit(p);
        setShown(i + 1);
        sfx.tap();
      });
      play.after(delay + i * step + onMs, () => setLit(null));
    });
    play.after(delay + s.length * step, () => {
      setMode('input');
      haptic('select');
    });
  };

  useEffect(() => {
    if (clock.phase === 'play') startSeq(fresh(START_LEN), 700);
    if (clock.phase === 'over') {
      play.clear();
      setLit(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock.phase]);

  const tap = (i: number) => {
    if (clock.phase !== 'play' || mode !== 'input') return;
    const ok = seq[pos] === i;
    pressK.current += 1;
    setPressed({ i, k: pressK.current, ok });
    const k = pressK.current;
    timers.after(220, () => setPressed((p) => (p && p.k === k ? null : p)));
    if (ok) {
      sfx.tap();
      haptic('light');
      const np = pos + 1;
      setPos(np);
      if (np === seq.length) {
        setRounds((r) => r + 1);
        setBest((b) => Math.max(b, seq.length));
        setMode('ok');
        sfx.buy();
        haptic('success');
        fx.flash('ok');
        fx.float(`+1 🔗${seq.length}`, 'ok', 50, 46);
        const grown = [...seq, nextPart(seq)];
        timers.after(650, () => startSeq(grown, 350));
      }
    } else {
      setMistakes((m) => m + 1);
      setMode('bad');
      sfx.error();
      haptic('error');
      fx.flash('bad');
      fx.float(`−${pct(pen)}`, 'bad', 50, 46);
      bumpShake();
      const len = Math.max(START_LEN, seq.length - 2);
      timers.after(950, () => startSeq(fresh(len), 450));
    }
  };

  const partial = mode === 'input' && seq.length ? pos / seq.length : 0;
  const score = clamp01(Math.min(1, (rounds + partial) / target) - mistakes * pen);

  const status =
    mode === 'show' ? `👀 ${tr(T.watch, lang)}` : mode === 'input' ? `👆 ${tr(T.turn, lang)}` : mode === 'ok' ? `✓ ${tr(T.ok, lang)}` : mode === 'bad' ? `✕ ${tr(T.bad, lang)}` : '…';
  const filled = mode === 'show' ? shown : mode === 'input' ? pos : mode === 'ok' ? seq.length : 0;

  const layout = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: 50 + 37 * Math.cos(a), y: 50 + 37 * Math.sin(a) };
  });

  return (
    <GameShell
      lang={lang}
      title={title}
      difficulty={d}
      theme="memory"
      icon="🔧"
      name={T.name}
      rules={T.rules}
      goal={tr(T.goal, lang, { n: target })}
      clock={clock}
      fx={fx.node}
      score={score}
      breakdown={[
        [`🔁 ${tr(T.rounds, lang)}`, `${rounds} / ${target}`],
        [`🔗 ${tr(T.best, lang)}`, String(best)],
        [`❌ ${tr(T.mistakes, lang)}`, mistakes ? `${mistakes} (−${pct(mistakes * pen)})` : '0'],
      ]}
      hud={
        <>
          <span className="mg-chip">
            🔁 {rounds}/{target}
          </span>
          {mistakes > 0 && <span className="mg-chip mg-chip-bad">✕{mistakes}</span>}
        </>
      }
      onDone={onDone}
      onQuit={onQuit}
    >
      <div className="mg-mem">
        <div key={shake} className={`mg-board mg-mode-${mode} ${shake ? 'mg-shake' : ''}`}>
          <svg className="mg-traces" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {layout.map((p, i) => (
              <line
                key={i}
                x1="50"
                y1="50"
                x2={p.x}
                y2={p.y}
                className={lit === i || pressed?.i === i ? 'on' : ''}
                style={{ stroke: PARTS[i]!.color }}
              />
            ))}
          </svg>
          <div className="mg-hub">
            <b>{status}</b>
            <div className="mg-dots">
              {seq.map((_, i) => (
                <i key={i} className={i < filled ? 'on' : ''} />
              ))}
            </div>
          </div>
          {layout.map((p, i) => {
            const part = PARTS[i]!;
            const isLit = lit === i;
            const pr = pressed && pressed.i === i ? (pressed.ok ? 'mg-press-ok' : 'mg-press-bad') : '';
            return (
              <button
                key={i}
                className={`mg-part ${isLit ? 'mg-lit' : ''} ${pr}`}
                style={{ left: `${p.x}%`, top: `${p.y}%`, '--c': part.color } as CSSProperties}
                onPointerDown={(e) => {
                  e.preventDefault();
                  tap(i);
                }}
                aria-label={part.tag}
              >
                <span className="mg-part-led" />
                <span className="mg-part-emoji">{part.emoji}</span>
                <small>{part.tag}</small>
              </button>
            );
          })}
        </div>
        <p className="mg-tip">
          🔗 {tr(T.chain, lang)}: {seq.length} · {tr(T.tip, lang)}
        </p>
      </div>
    </GameShell>
  );
}
