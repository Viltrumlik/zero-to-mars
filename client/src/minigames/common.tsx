import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react';
import { sfx } from '../sound.ts';
import { haptic } from '../telegram.ts';
import type { MiniGameProps } from './types.ts';

/* ------------------------------------------------------------------ i18n */

export type Lang = MiniGameProps['lang'];
export type Tx = Readonly<Record<Lang, string>>;

export const L = (uz: string, ru: string, en: string): Tx => ({ uz, ru, en });

export function tr(t: Tx, lang: Lang, vars?: Record<string, string | number>): string {
  let s = t[lang] ?? t.en;
  if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}

const C = {
  quit: L('Chiqish', 'Выйти', 'Quit'),
  quitTitle: L('Ishni tashlaysizmi?', 'Бросить работу?', 'Quit this job?'),
  quitText: L(
    "Smena hisoblanmaydi va pul to'lanmaydi.",
    'Смена не засчитается, и вам не заплатят.',
    "The shift won't count and you won't get paid.",
  ),
  stay: L('Ishlashda davom etish', 'Продолжить работу', 'Keep working'),
  leave: L('Ha, chiqaman', 'Да, уйти', 'Yes, quit'),
  start: L('Boshlash', 'Начать', 'Start'),
  go: L('Boshla!', 'Вперёд!', 'Go!'),
  over: L('Smena tugadi!', 'Смена окончена!', 'Shift over!'),
  cont: L('Davom etish', 'Продолжить', 'Continue'),
  great: L("Zo'r ish! Xo'jayin juda mamnun.", 'Отличная работа! Босс в восторге.', 'Great work! The boss is impressed.'),
  ok: L("Yomon emas, lekin bundan yaxshiroq qila olasiz.", 'Неплохо, но можно лучше.', 'Not bad, but you can do better.'),
  bad: L("Bu safar chiqmadi. Mashq qiling!", 'Слабовато. Нужно тренироваться!', 'Rough shift. Practice makes perfect!'),
  time: L('{n} soniya', '{n} сек', '{n} sec'),
  level: L('Qiyinlik', 'Сложность', 'Difficulty'),
  goal: L('Maqsad', 'Цель', 'Goal'),
  fullTime: L(
    "Ish vaqt tugaguncha davom etadi. Har bir xato maoshni kamaytiradi.",
    'Работа длится до конца таймера. Каждая ошибка снижает оплату.',
    'The shift lasts until the timer ends. Every mistake cuts your pay.',
  ),
  pay: L('Maosh', 'Оплата', 'Pay'),
};

/* ------------------------------------------------------------------ rng */

export interface Rng {
  next(): number;
  int(min: number, max: number): number; // inclusive
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
  chance(p: number): boolean;
}

/** mulberry32: tiny, fast, deterministic per seed. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0 || 0x9e3779b9;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    pick: (arr) => arr[Math.floor(next() * arr.length)]!,
    shuffle: (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
    chance: (p) => next() < p,
  };
}

export const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/* ------------------------------------------------------------------ hooks */

/** setTimeout that is cleared automatically on unmount. */
export function useTimers() {
  const ids = useRef(new Set<number>());
  useEffect(() => {
    const set = ids.current;
    return () => {
      set.forEach((id) => clearTimeout(id));
      set.clear();
    };
  }, []);
  return useMemo(
    () => ({
      after(ms: number, fn: () => void): void {
        const id = window.setTimeout(() => {
          ids.current.delete(id);
          fn();
        }, ms);
        ids.current.add(id);
      },
      clear(): void {
        ids.current.forEach((id) => clearTimeout(id));
        ids.current.clear();
      },
    }),
    [],
  );
}

export type Phase = 'intro' | 'play' | 'over';

export interface Clock {
  phase: Phase;
  startAt: number; // performance.now() at start
  total: number; // seconds
  start: () => void;
}

/** Fixed-length shift clock: the game ends ONLY when this runs out (or the player quits). */
export function useClock(total: number): Clock {
  const [st, setSt] = useState<{ phase: Phase; startAt: number }>({ phase: 'intro', startAt: 0 });
  const start = useCallback(() => {
    setSt((s) => (s.phase === 'intro' ? { phase: 'play', startAt: performance.now() } : s));
  }, []);
  useEffect(() => {
    if (st.phase !== 'play') return;
    const id = window.setInterval(() => {
      if (performance.now() - st.startAt >= total * 1000) setSt((s) => ({ ...s, phase: 'over' }));
    }, 100);
    return () => clearInterval(id);
  }, [st.phase, st.startAt, total]);
  return { phase: st.phase, startAt: st.startAt, total, start };
}

type FxKind = 'ok' | 'bad' | 'gold';
interface Floater {
  id: number;
  text: string;
  kind: FxKind;
  x: number;
  y: number;
}

/** Screen flashes and floating "+1 / −8%" texts, rendered by the shell. */
export function useFx() {
  const [flash, setFlash] = useState<{ id: number; kind: 'ok' | 'bad' } | null>(null);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const seq = useRef(0);
  const timers = useTimers();
  const doFlash = useCallback(
    (kind: 'ok' | 'bad') => {
      const id = ++seq.current;
      setFlash({ id, kind });
      timers.after(500, () => setFlash((f) => (f && f.id === id ? null : f)));
    },
    [timers],
  );
  const float = useCallback(
    (text: string, kind: FxKind = 'gold', x = 50, y = 42) => {
      const id = ++seq.current;
      setFloaters((fs) => [...fs.slice(-5), { id, text, kind, x, y }]);
      timers.after(1100, () => setFloaters((fs) => fs.filter((f) => f.id !== id)));
    },
    [timers],
  );
  const node = (
    <>
      {flash && <div key={flash.id} className={`mg-flash mg-flash-${flash.kind}`} />}
      {floaters.map((f) => (
        <div key={f.id} className={`mg-floater mg-fl-${f.kind}`} style={{ left: `${f.x}%`, top: `${f.y}%` }}>
          {f.text}
        </div>
      ))}
    </>
  );
  return { node, flash: doFlash, float };
}

/** Re-triggerable CSS animation: bump the key to replay. */
export function useBump(): [number, () => void] {
  const [n, setN] = useState(0);
  return [n, useCallback(() => setN((v) => v + 1), [])];
}

function useCountUp(target: number, ms = 1000): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      setV(target * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export const pct = (x: number): string => `${Math.round(x * 100)}%`;

/* ------------------------------------------------------------------ shell */

function TimerBar({ clock }: { clock: Clock }) {
  const wrap = useRef<HTMLDivElement>(null);
  const txt = useRef<HTMLSpanElement>(null);
  const { phase, startAt, total } = clock;
  useEffect(() => {
    const paint = (left: number) => {
      const k = Math.max(0, Math.min(1, left / total));
      wrap.current?.style.setProperty('--mg-t', k.toFixed(4));
      if (txt.current) txt.current.textContent = String(Math.ceil(left));
      if (wrap.current) wrap.current.dataset.low = phase === 'play' && left <= 5 ? '1' : '0';
    };
    if (phase !== 'play') {
      paint(phase === 'intro' ? total : 0);
      return;
    }
    let raf = 0;
    let lastSec = -1;
    const tick = () => {
      const left = Math.max(0, total - (performance.now() - startAt) / 1000);
      paint(left);
      const s = Math.ceil(left);
      if (s !== lastSec) {
        if (lastSec !== -1 && s <= 5 && s > 0) haptic('select');
        lastSec = s;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, startAt, total]);
  return (
    <div className="mg-timer" ref={wrap}>
      <div className="mg-timer-track">
        <div className="mg-timer-fill" />
      </div>
      <span className="mg-timer-txt">
        ⏱ <span ref={txt}>{total}</span>
      </span>
    </div>
  );
}

function Pips({ n }: { n: number }) {
  return (
    <span className="mg-pips" aria-label={`${n}/6`}>
      {Array.from({ length: 6 }, (_, i) => (
        <i key={i} className={i < n ? 'on' : ''} />
      ))}
    </span>
  );
}

function ResultCard({
  lang,
  icon,
  score,
  breakdown,
  onContinue,
}: {
  lang: Lang;
  icon: string;
  score: number;
  breakdown: Array<[string, string]>;
  onContinue: () => void;
}) {
  const shown = useCountUp(score);
  const tier = score >= 0.8 ? 'great' : score >= 0.45 ? 'ok' : 'bad';
  const R = 54;
  const circ = 2 * Math.PI * R;
  return (
    <div className="mg-cover">
      <div className="mg-card mg-result">
        <div className="mg-card-icon">{icon}</div>
        <h2>{tr(C.over, lang)}</h2>
        <div className={`mg-ring mg-tier-${tier}`}>
          <svg viewBox="0 0 128 128" aria-hidden="true">
            <circle cx="64" cy="64" r={R} className="mg-ring-bg" />
            <circle
              cx="64"
              cy="64"
              r={R}
              className="mg-ring-fg"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - shown)}
            />
          </svg>
          <div className="mg-ring-txt">
            <b>{Math.round(shown * 100)}%</b>
            <small>{tr(C.pay, lang)}</small>
          </div>
        </div>
        <p className={`mg-verdict mg-tier-${tier}`}>{tr(C[tier], lang)}</p>
        <div className="mg-breakdown">
          {breakdown.map(([k, v], i) => (
            <div key={i}>
              <span>{k}</span>
              <b>{v}</b>
            </div>
          ))}
        </div>
        <button className="mg-btn mg-primary mg-big" onClick={onContinue}>
          {tr(C.cont, lang)} →
        </button>
      </div>
    </div>
  );
}

export interface ShellProps {
  lang: Lang;
  title: string;
  difficulty: number;
  theme: string;
  icon: string;
  name: Tx;
  rules: Tx[];
  goal: string;
  clock: Clock;
  hud?: ReactNode;
  fx?: ReactNode;
  score: number;
  breakdown: Array<[string, string]>;
  onDone: (score: number) => void;
  onQuit: () => void;
  children: ReactNode;
}

export function GameShell(p: ShellProps): JSX.Element {
  const { lang, clock } = p;
  const [confirm, setConfirm] = useState(false);
  const [final, setFinal] = useState<number | null>(null);
  const [go, setGo] = useState(0);
  const doneRef = useRef(false);
  const scoreRef = useRef(p.score);
  scoreRef.current = p.score;

  useEffect(() => {
    if (clock.phase !== 'over' || final !== null) return;
    const s = clamp01(scoreRef.current);
    setFinal(s);
    setConfirm(false);
    if (s >= 0.8) {
      sfx.success();
      haptic('success');
    } else if (s >= 0.45) {
      sfx.coins();
      haptic('medium');
    } else {
      sfx.error();
      haptic('warning');
    }
  }, [clock.phase, final]);

  const start = () => {
    sfx.buy();
    haptic('medium');
    setGo((g) => g + 1);
    clock.start();
  };

  const finish = () => {
    if (doneRef.current || final === null) return;
    doneRef.current = true;
    sfx.coins();
    haptic('light');
    p.onDone(final);
  };

  const quit = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    haptic('heavy');
    p.onQuit();
  };

  return (
    <div className={`mg-root mg-theme-${p.theme}`} onContextMenu={(e) => e.preventDefault()}>
      <header className="mg-head">
        <button
          className="mg-x"
          aria-label={tr(C.quit, lang)}
          disabled={clock.phase === 'over'}
          onClick={() => {
            haptic('light');
            setConfirm(true);
          }}
        >
          ✕
        </button>
        <div className="mg-titles">
          <small>
            {p.icon} {tr(p.name, lang)}
          </small>
          <b>{p.title}</b>
        </div>
        <div className="mg-hud">{clock.phase !== 'intro' && p.hud}</div>
      </header>
      <TimerBar clock={clock} />
      <main className="mg-body">{clock.phase !== 'intro' && p.children}</main>
      <div className="mg-fx">
        {p.fx}
        {go > 0 && (
          <div key={go} className="mg-go">
            {tr(C.go, lang)}
          </div>
        )}
      </div>

      {clock.phase === 'intro' && (
        <div className="mg-cover">
          <div className="mg-card mg-intro">
            <div className="mg-card-icon">{p.icon}</div>
            <h2>{tr(p.name, lang)}</h2>
            <p className="mg-job">{p.title}</p>
            <ul className="mg-rules">
              {p.rules.map((r, i) => (
                <li key={i}>{tr(r, lang)}</li>
              ))}
            </ul>
            <div className="mg-chips">
              <span>⏱ {tr(C.time, lang, { n: clock.total })}</span>
              <span>
                🎯 {tr(C.goal, lang)}: {p.goal}
              </span>
              <span>
                {tr(C.level, lang)} <Pips n={p.difficulty} />
              </span>
            </div>
            <p className="mg-note">{tr(C.fullTime, lang)}</p>
            <button className="mg-btn mg-primary mg-big" onClick={start}>
              ▶ {tr(C.start, lang)}
            </button>
          </div>
        </div>
      )}

      {clock.phase === 'over' && final !== null && (
        <ResultCard lang={lang} icon={p.icon} score={final} breakdown={p.breakdown} onContinue={finish} />
      )}

      {confirm && clock.phase !== 'over' && (
        <div className="mg-cover mg-cover-top">
          <div className="mg-card mg-confirm">
            <div className="mg-card-icon mg-icon-red">🚪</div>
            <h2>{tr(C.quitTitle, lang)}</h2>
            <p>{tr(C.quitText, lang)}</p>
            <button
              className="mg-btn mg-primary mg-big"
              onClick={() => {
                haptic('light');
                setConfirm(false);
              }}
            >
              {tr(C.stay, lang)}
            </button>
            <button className="mg-btn mg-ghost mg-big" onClick={quit}>
              {tr(C.leave, lang)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
