import { describe, expect, it } from 'vitest';
import {
  MIN_JOB_MS,
  NIGHT_FROM,
  age,
  applyAction,
  applyEffects,
  cloneState,
  currentQuest,
  dailyReward,
  incomePerHour,
  jobBlocker,
  newGame,
  normalizeState,
  questReady,
  replayActions,
} from '../src/engine.ts';
import { ERAS } from '../src/content/eras.ts';
import { BUSINESSES } from '../src/content/businesses.ts';
import { BUILDINGS, BUILDING_BY_ID, JOBS, JOB_BY_ID, SHOP, STUDIES } from '../src/content/city.ts';
import { EVENTS } from '../src/content/events.ts';
import { QUESTS } from '../src/content/quests.ts';
import { SKILLS } from '../src/content/skills.ts';
import { LANGS } from '../src/types.ts';
import type { Action, GameState } from '../src/types.ts';
import { money } from '../src/format.ts';
import { runBot } from './bot.ts';

const T0 = Date.UTC(2026, 10, 8, 12, 0, 0);
const at = (s: GameState, ms = 0) => s.lastTick + ms;

function doJob(s: GameState, id: string, score = 1) {
  const start = applyAction(s, { t: 'jobStart', id, at: at(s) });
  if (!start.ok) return start;
  return applyAction(s, { t: 'jobEnd', id, score, at: at(s, MIN_JOB_MS[JOB_BY_ID[id].game]) });
}

describe('content', () => {
  it('has every text in every language', () => {
    const texts = [
      ...ERAS.flatMap((e) => [e.title, e.subtitle, e.homeName, e.companyName, ...(e.milestone ? [e.milestone.title, e.milestone.text, e.milestone.button] : [])]),
      ...BUSINESSES.map((b) => b.name),
      ...SKILLS.flatMap((s) => [s.name, s.desc]),
      ...BUILDINGS.flatMap((b) => [b.name, b.desc]),
      ...JOBS.map((j) => j.name),
      ...SHOP.flatMap((x) => [x.name, x.desc]),
      ...STUDIES.map((x) => x.name),
      ...QUESTS.flatMap((q) => [q.title, q.story]),
      ...EVENTS.flatMap((e) => [e.title, e.text, ...e.choices.map((c) => c.label)]),
    ];
    for (const t of texts) for (const l of LANGS) expect(t[l]?.length).toBeGreaterThan(0);
  });

  it('has unique ids', () => {
    for (const list of [BUSINESSES, BUILDINGS, JOBS, SHOP, STUDIES, QUESTS, EVENTS] as { id: string }[][]) {
      expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
    }
  });

  it('places every job, shop item and study in a building that exists in that era', () => {
    for (const x of [...JOBS, ...SHOP, ...STUDIES]) {
      const b = BUILDING_BY_ID[x.building];
      expect(b, x.id).toBeDefined();
      expect(b.minEra, x.id).toBeLessThanOrEqual(x.eras[0]);
      expect(b.maxEra, x.id).toBeGreaterThanOrEqual(x.eras[1]);
    }
  });

  it('every quest points to a building that exists in its era, and quests are ordered by era', () => {
    QUESTS.forEach((q, i) => {
      if (i > 0) expect(q.era).toBeGreaterThanOrEqual(QUESTS[i - 1].era);
      if (q.target) {
        const b = BUILDING_BY_ID[q.target];
        expect(q.era >= b.minEra && q.era <= b.maxEra, q.id).toBe(true);
      }
      if (q.cond.job) expect(JOB_BY_ID[q.cond.job[0]], q.id).toBeDefined();
    });
    for (const era of ERAS.slice(0, -1)) expect(QUESTS.some((q) => q.era === era.id && q.advanceEra)).toBe(true);
  });
});

describe('story', () => {
  it('a decent player can finish childhood and move abroad (no soft-lock)', () => {
    const r = runBot({ score: 0.7, untilEra: 2, maxDays: 120 });
    expect(r.stuck).toBe(false);
    expect(r.s.era).toBeGreaterThanOrEqual(2);
  });

  it('a starting kid has no money and cannot buy the computer', () => {
    const s = newGame(T0, 1);
    expect(s.cash).toBe(0);
    s.minute = 10 * 60;
    expect(applyAction(s, { t: 'buy', id: 'computer', at: T0 }).err).toBe('cash');
  });

  it('quests complete in order and the flight costs money', () => {
    const s = newGame(T0, 1);
    expect(currentQuest(s)?.id).toBe('q0_home');
    expect(questReady(s)).toBe(false);
    applyAction(s, { t: 'visit', b: 'home', at: T0 });
    expect(applyAction(s, { t: 'quest', at: T0 }).ok).toBe(true);
    expect(currentQuest(s)?.id).toBe('q0_paper');

    const fly = newGame(T0, 1);
    fly.quest = QUESTS.findIndex((q) => q.id === 'q0_fly');
    fly.day = 1 + 7 * 3;
    fly.cash = 1500;
    expect(age(fly)).toBe(17);
    expect(applyAction(fly, { t: 'quest', at: T0 }).ok).toBe(true);
    expect(fly.era).toBe(1);
    expect(fly.cash).toBe(600);
  });
});

describe('jobs', () => {
  it('pay depends on the mini-game score and jobs cost energy, food and time', () => {
    const good = newGame(T0, 1);
    const bad = cloneState(good);
    const r1 = doJob(good, 'newspaper', 1);
    const r2 = doJob(bad, 'newspaper', 0.1);
    expect(r1.ok && r2.ok).toBe(true);
    expect(good.cash).toBeGreaterThan(bad.cash * 3);
    expect(good.energy).toBe(100 - JOB_BY_ID.newspaper.energy);
    expect(good.minute).toBe(7 * 60 + JOB_BY_ID.newspaper.hours * 60);
  });

  it('rejects finishing a job faster than its minimum real duration', () => {
    const s = newGame(T0, 1);
    applyAction(s, { t: 'jobStart', id: 'newspaper', at: T0 });
    expect(applyAction(s, { t: 'jobEnd', id: 'newspaper', score: 1, at: T0 + 1000 }).err).toBe('too_fast');
    expect(s.cash).toBe(0);
  });

  it('enforces age, items, skills, opening hours and energy', () => {
    const s = newGame(T0, 1);
    expect(jobBlocker(s, JOB_BY_ID.cashier)).toBe('age:12');
    s.day = 1 + 4 * 3;
    expect(age(s)).toBe(14);
    expect(jobBlocker(s, JOB_BY_ID.courier)).toBe('item:bike');
    s.items.push('bike');
    expect(jobBlocker(s, JOB_BY_ID.courier)).toBe(null);
    expect(jobBlocker(s, JOB_BY_ID.pcrepair)).toBe('skill:code:2');
    s.minute = 13 * 60;
    expect(jobBlocker(s, JOB_BY_ID.newspaper)).toBe('closed:5:12');
    s.minute = 22 * 60 + 30;
    expect(jobBlocker(s, JOB_BY_ID.carwash)).toMatch(/closed|late/);
    s.minute = 9 * 60;
    s.energy = 5;
    expect(jobBlocker(s, JOB_BY_ID.carwash)).toBe('energy');
  });

  it('one-time jobs can only be done once', () => {
    const s = newGame(T0, 1);
    s.items.push('computer');
    s.skills.code = 3;
    expect(doJob(s, 'writegame').ok).toBe(true);
    expect(jobBlocker(s, JOB_BY_ID.writegame)).toBe('done');
  });
});

describe('survival', () => {
  it('starving drains health and sends you to hospital with a bill that can become debt', () => {
    const s = newGame(T0, 1);
    s.hunger = 0;
    s.health = 10;
    s.minute = 9 * 60;
    expect(applyAction(s, { t: 'study', id: 'read_code', at: T0 }).err).toBe('sick');
    applyAction(s, { t: 'rest', at: T0 });
    expect(s.stats.hospital).toBe(1);
    expect(s.cash).toBe(-ERAS[0].hospital);
    expect(s.minute).toBe(10 * 60);
  });

  it('sleeping starts a new day, restores energy, charges rent and compounds debt', () => {
    const s = newGame(T0, 1);
    s.era = 1;
    s.cash = -100;
    s.energy = 20;
    s.minute = 22 * 60;
    expect(applyAction(s, { t: 'sleep', at: T0 + 60_000 }).ok).toBe(true);
    expect(s.day).toBe(2);
    expect(s.minute).toBe(6 * 60);
    expect(s.energy).toBe(100);
    const debt = 100 + ERAS[1].rent;
    expect(s.cash).toBe(-(debt + Math.round(debt * 0.05)));
  });

  it("can't sleep when not tired during the day, nor spam sleep", () => {
    const s = newGame(T0, 1);
    expect(applyAction(s, { t: 'sleep', at: T0 + 60_000 }).err).toBe('not_tired');
    s.minute = NIGHT_FROM;
    expect(applyAction(s, { t: 'sleep', at: T0 + 60_000 }).ok).toBe(true);
    s.minute = NIGHT_FROM;
    expect(applyAction(s, { t: 'sleep', at: T0 + 61_000 }).err).toBe('too_soon');
  });

  it('family meal is free once per day; food restores hunger and takes time', () => {
    const s = newGame(T0, 1);
    s.hunger = 20;
    expect(applyAction(s, { t: 'buy', id: 'family', at: T0 }).ok).toBe(true);
    expect(s.hunger).toBeGreaterThan(70);
    expect(applyAction(s, { t: 'buy', id: 'family', at: T0 }).err).toBe('today');
    expect(s.stats.meals).toBe(1);
  });
});

describe('studying', () => {
  it('levels a skill after enough xp', () => {
    const s = newGame(T0, 1);
    s.minute = 8 * 60;
    for (let i = 0; i < 3; i++) applyAction(s, { t: 'study', id: 'read_code', at: T0 });
    expect(s.skills.code).toBe(1);
  });
});

describe('businesses (era 2+) earn in real time, not game time', () => {
  it('income accrues with real time and is capped offline', () => {
    const s = newGame(T0, 1);
    s.era = 2;
    s.cash = 5_000;
    expect(applyAction(s, { t: 'invest', id: 'citymap', at: T0 }).ok).toBe(true);
    const perHour = incomePerHour(s);
    replayActions(s, [], T0 + 10 * 3_600_000);
    expect(s.cash).toBeCloseTo(perHour * 3);
  });

  it('cannot invest before the startup era', () => {
    const s = newGame(T0, 1);
    s.cash = 1e6;
    expect(applyAction(s, { t: 'invest', id: 'citymap', at: T0 }).err).toBe('locked');
  });
});

describe('server replay', () => {
  it('client prediction and server replay end in the same state', () => {
    const client = newGame(T0, 99);
    const server = cloneState(client);
    const actions: Action[] = [
      { t: 'visit', b: 'home', at: T0 + 1000 },
      { t: 'quest', at: T0 + 2000 },
      { t: 'jobStart', id: 'newspaper', at: T0 + 3000 },
      { t: 'jobEnd', id: 'newspaper', score: 0.9, at: T0 + 40_000 },
      { t: 'buy', id: 'family', at: T0 + 45_000 },
      { t: 'study', id: 'read_code', at: T0 + 50_000 },
    ];
    for (const a of actions) applyAction(client, a);
    replayActions(server, actions, T0 + 50_000);
    expect(server).toEqual(client);
  });

  it('clamps timestamps so a client cannot fake the job duration', () => {
    const s = newGame(T0, 1);
    replayActions(
      s,
      [
        { t: 'jobStart', id: 'newspaper', at: T0 - 999_999 },
        { t: 'jobEnd', id: 'newspaper', score: 1, at: T0 + 999_999 },
      ],
      T0 + 2000,
    );
    expect(s.cash).toBe(0);
  });

  it('ignores malformed actions', () => {
    const s = newGame(T0, 1);
    const res = replayActions(
      s,
      [null, { t: 'nope', at: T0 }, { t: 'buy', id: '__proto__', at: T0 }, { t: 'visit', b: 'constructor', at: T0 }] as unknown as Action[],
      T0,
    );
    expect(res.applied).toBe(0);
    expect(res.rejected).toBe(4);
  });

  it('normalizeState repairs garbage and resets old v1 saves', () => {
    expect(normalizeState({ v: 1, cash: 1e9 }, T0).cash).toBe(0);
    const s = normalizeState({ v: 2, cash: NaN, era: 99, skills: null, items: ['bike', 'rocket'], event: 'missing', day: -3 }, T0);
    expect(s.cash).toBe(0);
    expect(s.era).toBe(ERAS.length - 1);
    expect(s.skills.code).toBe(0);
    expect(s.items).toEqual(['bike']);
    expect(s.event).toBeNull();
    expect(s.day).toBe(1);
  });
});

describe('boosts and rewards', () => {
  it('a weaker or shorter boost never replaces a better running one', () => {
    const s = newGame(T0, 1);
    applyEffects(s, { boost: { mult: 2, minutes: 120 } }, T0);
    applyEffects(s, { boost: { mult: 1.5, minutes: 30 } }, T0);
    expect(s.boost).toEqual({ mult: 2, until: T0 + 120 * 60_000 });
    applyEffects(s, { boost: { mult: 3, minutes: 10 } }, T0);
    expect(s.boost).toEqual({ mult: 3, until: T0 + 10 * 60_000 });
  });

  it('daily reward is small in childhood and builds a streak', () => {
    const s = newGame(T0, 1);
    expect(dailyReward(s, T0)!.amount).toBeLessThanOrEqual(10);
    expect(applyAction(s, { t: 'daily', at: T0 }).ok).toBe(true);
    expect(applyAction(s, { t: 'daily', at: T0 + 1000 }).ok).toBe(false);
    expect(applyAction(s, { t: 'daily', at: T0 + 86_400_000 }).ok).toBe(true);
    expect(s.daily.streak).toBe(2);
  });
});

describe('format', () => {
  it('formats money compactly per language', () => {
    expect(money(950, 'en')).toBe('$950');
    expect(money(1_250_000, 'en')).toBe('$1.25M');
    expect(money(22_000_000, 'uz')).toBe('$22.0 mln');
    expect(money(-120, 'en')).toBe('-$120');
  });
});
