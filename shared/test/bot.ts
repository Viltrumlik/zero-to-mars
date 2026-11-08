/**
 * A scripted player used by tests (the story must be completable) and by
 * scripts/balance.ts (how long does each life chapter take?).
 * It follows the quest chain, eats, studies, works, invests and sleeps.
 */
import {
  applyAction,
  bizCost,
  bizIncome,
  currentQuest,
  hasItem,
  jobBlocker,
  launchBlocker,
  newGame,
  questReady,
  shopBlocker,
  shopPrice,
  sleepBlocker,
  studyBlocker,
} from '../src/engine.ts';
import { JOBS, SHOP, STUDIES } from '../src/content/city.ts';
import { BUSINESSES } from '../src/content/businesses.ts';
import { ERAS } from '../src/content/eras.ts';
import type { Action, GameState, ItemId, MiniGameKind, SkillId } from '../src/types.ts';

/** Real seconds a job takes: walking there + the mini-game (mirrors client timings). */
const MINIGAME_SECONDS = (game: MiniGameKind, difficulty: number, stops = 4) =>
  (game === 'route' ? stops * 7 : 30 + 4 * difficulty) + 5;

type ActIn = Action extends infer A ? (A extends { at: number } ? Omit<A, 'at'> : never) : never;

export interface BotResult {
  s: GameState;
  eras: { era: number; day: number; realHours: number; calendarDays: number }[];
  hospital: number;
  stuck: boolean;
}

const ITEM_PLAN: ItemId[][] = [['bike', 'phone', 'computer'], ['student', 'laptop'], [], [], [], [], []];

export function runBot(
  opts: { score?: number; maxDays?: number; untilEra?: number; seed?: number; sessionMinutes?: number; gapHours?: number } = {},
): BotResult {
  const score = opts.score ?? 0.75;
  const maxDays = opts.maxDays ?? 400;
  const untilEra = opts.untilEra ?? ERAS.length - 1;
  let t = Date.UTC(2026, 0, 1);
  const s = newGame(t, opts.seed ?? 7, 'Bot');
  const eras: BotResult['eras'] = [];
  let guard = 0;
  let idle = 0;

  // Real players play in sessions; between them businesses keep earning (capped offline).
  const sessionMs = (opts.sessionMinutes ?? 20) * 60_000;
  const gapMs = (opts.gapHours ?? 4) * 3_600_000;
  let active = 0;
  let sessionLeft = sessionMs;
  const act = (a: ActIn, realSeconds: number) => {
    t += realSeconds * 1000;
    active += realSeconds * 1000;
    sessionLeft -= realSeconds * 1000;
    if (sessionLeft <= 0) {
      t += gapMs;
      sessionLeft = sessionMs;
    }
    return applyAction(s, { ...a, at: t } as Action);
  };

  while (s.day < maxDays && s.era < untilEra && guard++ < 200_000) {
    if (s.event) {
      act({ t: 'choose', id: s.event, c: 0 }, 4);
      continue;
    }
    const flag = currentQuest(s)?.cond.flag;
    if (flag?.startsWith('v:') && !s.flags[flag]) {
      act({ t: 'visit', b: flag.slice(2) }, 15);
      continue;
    }
    if (questReady(s)) {
      const era = s.era;
      act({ t: 'quest' }, 6);
      if (s.era !== era) eras.push({ era: s.era, day: s.day, realHours: active / 3_600_000, calendarDays: (t - s.createdAt) / 86_400_000 });
      continue;
    }
    // 1. survive
    if (s.hunger < 40 || (s.health < 50 && s.hunger < 80)) {
      const food = SHOP.filter((f) => f.hunger && !shopBlocker(s, f.id)).sort(
        (a, b) => shopPrice(s, a.id) / (a.hunger ?? 1) - shopPrice(s, b.id) / (b.hunger ?? 1),
      )[0];
      if (food) {
        act({ t: 'buy', id: food.id }, 12);
        continue;
      }
    }
    if (s.health < 35 && !shopBlocker(s, 'treatment')) {
      act({ t: 'buy', id: 'treatment' }, 15);
      continue;
    }
    // 2. buy the tools the story needs
    const q = currentQuest(s);
    const wanted = [...(q?.cond.item ? [q.cond.item] : []), ...(ITEM_PLAN[s.era] ?? [])];
    const buyable = SHOP.find((x) => x.item && wanted.includes(x.item) && !hasItem(s, x.item) && !shopBlocker(s, x.id) && s.cash - shopPrice(s, x.id) >= 15);
    if (buyable) {
      act({ t: 'buy', id: buyable.id }, 15);
      continue;
    }
    // 3. invest spare cash (era 2+), story-required businesses first
    const qBiz = q?.cond.bizId;
    if (qBiz && (s.biz[qBiz[0]] ?? 0) < qBiz[1] && s.cash >= bizCost(qBiz[0], s.biz[qBiz[0]] ?? 0)) {
      act({ t: 'invest', id: qBiz[0] }, 3);
      continue;
    }
    if (s.era >= 2) {
      const best = BUSINESSES.filter((b) => b.era <= s.era)
        .map((b) => ({ b, cost: bizCost(b.id, s.biz[b.id] ?? 0), gain: bizIncome(b.id, (s.biz[b.id] ?? 0) + 1) - bizIncome(b.id, s.biz[b.id] ?? 0) }))
        .filter((x) => x.cost <= s.cash * 0.9)
        .sort((x, y) => y.gain / y.cost - x.gain / x.cost)[0];
      if (best) {
        act({ t: 'invest', id: best.b.id }, 3);
        continue;
      }
    }
    if (s.era >= 4 && !launchBlocker(s, t) && s.cash > ERAS[s.era].launchCost * 3) {
      act({ t: 'launch' }, 20);
      continue;
    }
    // 4. study a skill the story or a better job needs
    const needSkill = skillNeeded(s);
    if (needSkill) {
      const st = STUDIES.filter((x) => x.skill === needSkill && !studyBlocker(s, x.id) && s.cash - x.price >= 20).sort((a, b) => b.xp / b.hours - a.xp / a.hours)[0];
      if (st && (s.energy - st.energy >= 25 || !bestJob(s))) {
        act({ t: 'study', id: st.id }, 18);
        continue;
      }
    }
    // 5. work
    const job = bestJob(s);
    if (job) {
      act({ t: 'jobStart', id: job.id }, 15);
      act({ t: 'jobEnd', id: job.id, score }, MINIGAME_SECONDS(job.game, job.difficulty, job.stops));
      continue;
    }
    // 6. rest or sleep
    if (!sleepBlocker(s, t)) {
      act({ t: 'sleep' }, Math.max(10, (s.lastSleepAt + 40_000 - t) / 1000));
      continue;
    }
    if (sleepBlocker(s, t) === 'too_soon') {
      t = s.lastSleepAt + 40_000;
      continue;
    }
    const r = act({ t: 'rest' }, 3);
    if (!r.ok) {
      if (++idle > 50) return { s, eras, hospital: s.stats.hospital, stuck: true };
      t += 60_000;
      act({ t: 'sleep' }, 5);
    } else idle = 0;
  }
  return { s, eras, hospital: s.stats.hospital, stuck: s.era < untilEra && s.day >= maxDays };
}

function bestJob(s: GameState) {
  return JOBS.filter((j) => !jobBlocker(s, j))
    .filter((j) => s.energy - j.energy >= 0)
    .sort((a, b) => b.pay / b.hours - a.pay / a.hours || (b.once ? 1 : 0) - (a.once ? 1 : 0))
    .sort((a, b) => (b.once ? 1 : 0) - (a.once ? 1 : 0))[0];
}

/** The skill the bot should study next: quest requirement first, then the cheapest locked job upgrade. */
function skillNeeded(s: GameState): SkillId | null {
  const q = currentQuest(s);
  for (const [k, v] of Object.entries(q?.cond.skills ?? {})) if (s.skills[k as SkillId] < (v ?? 0)) return k as SkillId;
  const locked = JOBS.filter((j) => s.era >= j.eras[0] && s.era <= j.eras[1] && j.skills)
    .flatMap((j) => Object.entries(j.skills!).filter(([k, v]) => s.skills[k as SkillId] < (v ?? 0)).map(([k]) => k as SkillId));
  return locked[0] ?? null;
}
