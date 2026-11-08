import { useMemo, useState, type JSX } from 'react';
import { sfx } from '../sound.ts';
import { haptic } from '../telegram.ts';
import { GameShell, L, clamp01, makeRng, pct, tr, useBump, useClock, useFx, useTimers, type Rng } from './common.tsx';
import { MINIGAME_DURATION, type MiniGameProps } from './types.ts';

const T = {
  name: L('Kassa', 'Касса', 'Cashier'),
  rules: [
    L(
      "Mijoz to'laydi — qaytimni aniq sanab bering.",
      'Клиент платит — отсчитайте точную сдачу.',
      'The customer pays — count out the exact change.',
    ),
    L(
      "Qaytim = to'langan − jami. Pul va tangalarni bosing, keyin «Berish».",
      'Сдача = оплачено − итого. Жмите купюры и монеты, затем «Отдать».',
      'Change = paid − total. Tap bills and coins, then "Give".',
    ),
    L(
      "Xato qaytim — jarima. Ikki xatodan keyin mijoz ketib qoladi.",
      'Неверная сдача — штраф. После двух ошибок клиент уходит.',
      'Wrong change costs you. After two mistakes the customer walks out.',
    ),
  ],
  hiddenRule: L(
    "Bu darajada lotokdagi summa ko'rinmaydi — o'zingiz sanang!",
    'На этой сложности сумма в лотке скрыта — считайте сами!',
    'At this level the tray sum is hidden — count it yourself!',
  ),
  goal: L('{n} mijoz', '{n} клиентов', '{n} customers'),
  total: L('Jami', 'Итого', 'Total'),
  paid: L("To'ladi", 'Оплатил', 'Paid'),
  tray: L('Qaytim', 'Сдача', 'Change'),
  empty: L('Pul yoki tanga bosing', 'Нажмите купюру или монету', 'Tap a bill or coin'),
  give: L('Berish', 'Отдать', 'Give'),
  undo: L('Orqaga', 'Назад', 'Undo'),
  clear: L('Tozalash', 'Сброс', 'Clear'),
  says: L('Mana, {m}', 'Вот, держите {m}', "Here's {m}"),
  thanks: L('Rahmat! 👍', 'Спасибо! 👍', 'Thanks! 👍'),
  wrong: L("Bu noto'g'ri-ku! 😠", 'Это неправильно! 😠', "That's not right! 😠"),
  left: L('Ketdim! Qaytim {m} edi 😤', 'Ухожу! Сдача была {m} 😤', "I'm out! Change was {m} 😤"),
  served: L('Xizmat qilindi', 'Обслужено', 'Served'),
  mistakes: L('Xatolar', 'Ошибки', 'Mistakes'),
  lost: L('Ketib qolgan', 'Ушли', 'Walked out'),
};

const FACES = ['🧔', '👩', '👨‍🦱', '👵', '👴', '👩‍🦰', '🧑‍💼', '👨‍🔧', '👩‍🎓', '🧕', '🤠', '👨‍🍳', '👩‍💻', '🧑‍🚀'];
const ITEMS = ['🍞', '🥛', '🧀', '🍎', '🍌', '🥚', '🍫', '🍕', '☕', '🧃', '🍪', '🥤', '🧴', '🧼', '🔋', '🎧', '👟', '👕', '🧸', '🎮', '💡', '🍉', '🥩', '🍯', '📓', '🪴'];

/** Denominations in cents per difficulty (1..6). */
const DENOMS: number[][] = [
  [100, 500, 1000],
  [100, 500, 1000, 2000],
  [5, 10, 25, 100, 500, 1000, 2000],
  [1, 5, 10, 25, 100, 500, 1000, 2000],
  [1, 5, 10, 25, 100, 500, 1000, 2000, 5000],
  [1, 5, 10, 25, 100, 500, 1000, 2000, 5000, 10000],
];

interface Item {
  emoji: string;
  price: number;
}
interface Customer {
  id: number;
  face: string;
  items: Item[];
  total: number;
  paid: number;
  change: number;
}

function makeCustomer(rng: Rng, d: number, id: number): Customer {
  const n = [2, rng.int(2, 3), 3, rng.int(3, 4), rng.int(3, 4), 4][d - 1]!;
  const emojis = rng.shuffle(ITEMS);
  const items: Item[] = [];
  for (let i = 0; i < n; i++) {
    let price: number;
    if (d === 1) price = rng.int(1, 7) * 100;
    else if (d === 2) price = rng.int(2, 14) * 100;
    else if (d === 3) price = rng.int(20, 259) * 5;
    else if (d === 4) price = rng.int(101, 1999);
    else if (d === 5) price = rng.int(300, 6499);
    else price = rng.int(500, 12999);
    items.push({ emoji: emojis[i]!, price });
  }
  const total = items.reduce((s, it) => s + it.price, 0);
  const steps = d <= 1 ? [1000, 2000] : d <= 3 ? [1000, 2000, 5000] : d === 4 ? [2000, 5000, 10000] : [2000, 5000, 10000];
  const cands = [...new Set(steps.map((s) => Math.ceil((total + 1) / s) * s))].sort((a, b) => a - b);
  // Mostly the smallest sensible note, sometimes a bigger one.
  let paid = rng.chance(0.7) ? cands[0]! : rng.pick(cands);
  // Expert customers add their odd cents so the change is round: read carefully!
  if (d === 6 && total % 100 !== 0 && rng.chance(0.35)) paid += total % 100;
  return { id, face: rng.pick(FACES), items, total, paid, change: paid - total };
}

function money(cents: number, withCents: boolean): string {
  const neg = cents < 0;
  const v = Math.abs(cents);
  const s = withCents ? (v / 100).toFixed(2) : String(Math.round(v / 100));
  return `${neg ? '−' : ''}$${s}`;
}

function denomLabel(c: number): string {
  return c >= 100 ? `$${c / 100}` : `${c}¢`;
}

type Mood = 'pay' | 'thanks' | 'wrong' | 'left';

export function ChangeGame({ difficulty: d, lang, seed, title, onDone, onQuit }: MiniGameProps): JSX.Element {
  const clock = useClock(MINIGAME_DURATION(d));
  const fx = useFx();
  const timers = useTimers();
  const [rng] = useState(() => makeRng(seed ^ 0x0c4a5e11));
  const target = 3 + d;
  const pen = 0.08 + 0.01 * d;
  const cents = d >= 3;
  const showSum = d <= 4;
  const denoms = DENOMS[d - 1]!;
  const coins = denoms.filter((x) => x < 100);
  const bills = denoms.filter((x) => x >= 100);

  const [cust, setCust] = useState<Customer>(() => makeCustomer(rng, d, 1));
  const [given, setGiven] = useState<number[]>([]);
  const [served, setServed] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [lost, setLost] = useState(0);
  const [tries, setTries] = useState(0);
  const [mood, setMood] = useState<Mood>('pay');
  const [leaving, setLeaving] = useState(false);
  const [shake, bumpShake] = useBump();

  const playing = clock.phase === 'play' && !leaving;
  const sum = given.reduce((s, x) => s + x, 0);

  const nextCustomer = (delay: number) => {
    setLeaving(true);
    timers.after(delay, () => {
      setCust((c) => makeCustomer(rng, d, c.id + 1));
      setGiven([]);
      setTries(0);
      setMood('pay');
      setLeaving(false);
    });
  };

  const add = (c: number) => {
    if (!playing) return;
    if (given.length >= 30) return;
    sfx.tap();
    haptic('light');
    setGiven((g) => [...g, c]);
  };

  const removeOne = (c: number) => {
    if (!playing) return;
    const i = given.lastIndexOf(c);
    if (i < 0) return;
    haptic('select');
    setGiven((g) => g.filter((_, j) => j !== i));
  };

  const give = () => {
    if (!playing) return;
    if (given.length === 0) {
      haptic('warning');
      bumpShake();
      return;
    }
    if (sum === cust.change) {
      setServed((s) => s + 1);
      setMood('thanks');
      sfx.coins();
      haptic('success');
      fx.flash('ok');
      fx.float('+1 👍', 'ok', 50, 28);
      nextCustomer(650);
    } else {
      setMistakes((m) => m + 1);
      sfx.error();
      haptic('error');
      fx.flash('bad');
      fx.float(`−${pct(pen)}`, 'bad', 50, 28);
      bumpShake();
      const t = tries + 1;
      setTries(t);
      if (t >= 2) {
        setLost((l) => l + 1);
        setMood('left');
        nextCustomer(1700);
      } else {
        setMood('wrong');
        timers.after(900, () => setMood((m) => (m === 'wrong' ? 'pay' : m)));
      }
    }
  };

  const score = clamp01(Math.min(1, served / target) - mistakes * pen);

  // Group the tray by denomination, biggest first.
  const groups = useMemo(() => {
    const m = new Map<number, number>();
    for (const g of given) m.set(g, (m.get(g) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [given]);

  const bubble =
    mood === 'thanks'
      ? tr(T.thanks, lang)
      : mood === 'wrong'
        ? tr(T.wrong, lang)
        : mood === 'left'
          ? tr(T.left, lang, { m: money(cust.change, cents) })
          : tr(T.says, lang, { m: money(cust.paid, cents) });

  const rules = showSum ? T.rules : [...T.rules, T.hiddenRule];

  return (
    <GameShell
      lang={lang}
      title={title}
      difficulty={d}
      theme="change"
      icon="🧾"
      name={T.name}
      rules={rules}
      goal={tr(T.goal, lang, { n: target })}
      clock={clock}
      fx={fx.node}
      score={score}
      breakdown={[
        [`👥 ${tr(T.served, lang)}`, `${served} / ${target}`],
        [`❌ ${tr(T.mistakes, lang)}`, mistakes ? `${mistakes} (−${pct(mistakes * pen)})` : '0'],
        [`🚶 ${tr(T.lost, lang)}`, String(lost)],
      ]}
      hud={
        <>
          <span className="mg-chip">
            👥 {served}/{target}
          </span>
          {mistakes > 0 && <span className="mg-chip mg-chip-bad">✕{mistakes}</span>}
        </>
      }
      onDone={onDone}
      onQuit={onQuit}
    >
      <div className="mg-cash">
        <div key={cust.id} className={`mg-cust ${leaving ? (mood === 'left' ? 'mg-cust-out mg-cust-out-slow' : 'mg-cust-out') : ''} mg-mood-${mood}`}>
          <div className="mg-face">{cust.face}</div>
          <div className="mg-bubble">{bubble}</div>
        </div>

        <div className="mg-receipt" key={`r${cust.id}`}>
          {cust.items.map((it, i) => (
            <div className="mg-item" key={i}>
              <span className="mg-item-emoji">{it.emoji}</span>
              <i />
              <b>{money(it.price, cents)}</b>
            </div>
          ))}
          <div className="mg-sumrow">
            <span>{tr(T.total, lang)}</span>
            <b>{money(cust.total, cents)}</b>
          </div>
          <div className="mg-paidrow">
            <span>💵 {tr(T.paid, lang)}</span>
            <b>{money(cust.paid, cents)}</b>
          </div>
        </div>

        <div key={`t${shake}`} className={`mg-tray ${shake ? 'mg-shake' : ''}`}>
          <div className="mg-tray-head">
            <span>{tr(T.tray, lang)}</span>
            <b className={showSum ? '' : 'mg-hidden-sum'}>{showSum ? money(sum, cents) : '$ ?'}</b>
          </div>
          <div className="mg-tray-chips">
            {groups.length === 0 && <span className="mg-tray-empty">{tr(T.empty, lang)}</span>}
            {groups.map(([c, n]) => (
              <button
                key={`${c}:${n}`}
                className={`mg-tchip ${c >= 100 ? 'mg-tchip-bill' : 'mg-tchip-coin'}`}
                onClick={() => removeOne(c)}
              >
                {denomLabel(c)}
                {n > 1 && <em>×{n}</em>}
              </button>
            ))}
          </div>
        </div>

        <div className="mg-pad">
          {coins.length > 0 && (
            <div className="mg-pad-row mg-pad-coins">
              {coins.map((c) => (
                <button key={c} className={`mg-coin mg-coin-${c}`} onClick={() => add(c)} disabled={!playing}>
                  {denomLabel(c)}
                </button>
              ))}
            </div>
          )}
          <div className="mg-pad-row">
            {bills.map((c) => (
              <button key={c} className="mg-bill" onClick={() => add(c)} disabled={!playing}>
                {denomLabel(c)}
              </button>
            ))}
          </div>
        </div>

        <div className="mg-actions">
          <button
            className="mg-btn mg-ghost"
            disabled={!playing || given.length === 0}
            onClick={() => {
              haptic('select');
              setGiven((g) => g.slice(0, -1));
            }}
          >
            ↶ {tr(T.undo, lang)}
          </button>
          <button
            className="mg-btn mg-ghost"
            disabled={!playing || given.length === 0}
            onClick={() => {
              haptic('select');
              setGiven([]);
            }}
          >
            ✕ {tr(T.clear, lang)}
          </button>
          <button className="mg-btn mg-primary mg-give" disabled={!playing} onClick={give}>
            {tr(T.give, lang)} ✓
          </button>
        </div>
      </div>
    </GameShell>
  );
}
