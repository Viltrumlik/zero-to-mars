/**
 * Deterministic game engine shared by the client (prediction) and the server
 * (authority). Every function mutates the passed state in place; callers that
 * need the old state must clone first (see cloneState).
 *
 * Two clocks exist:
 *  - the in-game calendar (day + minute) only moves when the hero does
 *    something (work, study, eat, sleep). It is paused while the app is closed.
 *  - real time (lastTick, ms) drives passive business income, boosts,
 *    launch cool-downs and the anti-cheat minimum duration of jobs.
 */
import { ERAS, LAST_ERA } from './content/eras.ts';
import { BIZ_BY_ID } from './content/businesses.ts';
import { BUILDING_BY_ID, JOB_BY_ID, SHOP_BY_ID, STUDY_BY_ID } from './content/city.ts';
import { EVENTS, EVENT_BY_ID } from './content/events.ts';
import { QUESTS } from './content/quests.ts';
import type {
  Action,
  Building,
  Cond,
  EffectSummary,
  Effects,
  GameState,
  ItemId,
  Job,
  MiniGameKind,
  Outcome,
  Quest,
  Requirements,
  SkillId,
} from './types.ts';

// ------------------------------------------------------------- constants ---

export const START_AGE = 10;
export const DAYS_PER_YEAR = 3;
export const WAKE_MINUTE = 6 * 60;
export const START_MINUTE = 7 * 60;
export const LAST_MINUTE = 24 * 60 - 1;
export const NIGHT_FROM = 19 * 60;
export const REST_MINUTES = 120;
export const SLEEP_MAX_ENERGY = 70;
export const MIN_SLEEP_GAP_MS = 40_000;
export const OFFLINE_CAP_MS = 3 * 3600_000;
export const LAUNCH_COOLDOWN_MS = 30 * 60_000;
export const DEBT_INTEREST = 0.05;
export const INCOME_SCALE = 0.3;
export const DAILY_UNITS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
export const MIN_JOB_MS: Record<MiniGameKind, number> = {
  route: 12_000,
  change: 30_000,
  memory: 30_000,
  code: 30_000,
  scrub: 30_000,
};
const LEVEL_MILESTONES = [25, 50, 100, 200, 400];
export const SKILL_IDS: SkillId[] = ['code', 'biz', 'eng', 'fit'];
const ITEM_IDS: ItemId[] = ['bike', 'phone', 'computer', 'student', 'laptop', 'scooter', 'car'];

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
export const isBizId = (id: unknown): id is string => typeof id === 'string' && has(BIZ_BY_ID, id);
export const isEventId = (id: unknown): id is string => typeof id === 'string' && has(EVENT_BY_ID, id);
export const isBuildingId = (id: unknown): id is string => typeof id === 'string' && has(BUILDING_BY_ID, id);
export const isJobId = (id: unknown): id is string => typeof id === 'string' && has(JOB_BY_ID, id);
export const isShopId = (id: unknown): id is string => typeof id === 'string' && has(SHOP_BY_ID, id);
export const isStudyId = (id: unknown): id is string => typeof id === 'string' && has(STUDY_BY_ID, id);

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------- state ----

export function newGame(now: number, seed: number, name = ''): GameState {
  const s: GameState = {
    v: 2,
    name: sanitizeName(name) || 'Founder',
    createdAt: now,
    lastTick: now,
    day: 1,
    minute: START_MINUTE,
    cash: 0,
    spent: 0,
    totalEarned: 0,
    energy: 100,
    hunger: 70,
    health: 100,
    era: 0,
    reputation: 50,
    skills: { code: 0, biz: 0, eng: 0, fit: 0 },
    xp: { code: 0, biz: 0, eng: 0, fit: 0 },
    items: [],
    biz: {},
    boost: null,
    rng: seed >>> 0,
    event: null,
    nextEventAt: 0,
    seen: [],
    job: null,
    quest: 0,
    flags: {},
    jobCounts: {},
    stats: { jobs: 0, meals: 0, sleeps: 0, studies: 0, hospital: 0 },
    lastSleepAt: 0,
    rd: 0,
    launches: 0,
    launchOk: 0,
    launchFail: 0,
    eraLaunchOk: 0,
    nextLaunchAt: 0,
    colonists: 0,
    daily: { day: '', streak: 0 },
    billionaireAt: null,
  };
  s.nextEventAt = absMinute(s) + 30 * 60;
  return s;
}

export function cloneState(s: GameState): GameState {
  return structuredClone(s);
}

const finite = (v: unknown, lo = 0): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo;

/** Repairs a state loaded from storage so a corrupted or outdated save can never crash the game. */
export function normalizeState(raw: unknown, now: number): GameState {
  const base = newGame(now, Math.floor(Math.random() * 2 ** 32));
  if (!raw || typeof raw !== 'object' || (raw as { v?: unknown }).v !== 2) return base;
  const r = raw as Partial<GameState>;
  const s = { ...base, ...r } as GameState;
  s.name = sanitizeName(String(r.name ?? '')) || base.name;
  for (const k of ['spent', 'totalEarned', 'reputation', 'rd', 'lastTick', 'createdAt', 'nextEventAt', 'nextLaunchAt', 'lastSleepAt', 'rng'] as const) {
    if (!finite(s[k])) s[k] = base[k];
  }
  if (typeof s.cash !== 'number' || !Number.isFinite(s.cash)) s.cash = 0;
  for (const k of ['energy', 'hunger', 'health'] as const) s[k] = finite(s[k]) ? clamp(s[k], 0, 200) : base[k];
  s.day = Number.isInteger(s.day) && s.day >= 1 ? s.day : 1;
  s.minute = Number.isInteger(s.minute) ? clamp(s.minute, 0, LAST_MINUTE) : START_MINUTE;
  s.era = Number.isInteger(s.era) ? clamp(s.era, 0, LAST_ERA) : 0;
  s.quest = Number.isInteger(s.quest) ? clamp(s.quest, 0, QUESTS.length) : 0;
  s.rng = s.rng >>> 0;
  if (s.lastTick > now + 60_000) s.lastTick = now;

  const skills = { ...base.skills };
  const xp = { ...base.xp };
  for (const id of SKILL_IDS) {
    const lv = (r.skills as Record<string, unknown> | undefined)?.[id];
    const x = (r.xp as Record<string, unknown> | undefined)?.[id];
    if (typeof lv === 'number' && Number.isInteger(lv) && lv >= 0 && lv < 100) skills[id] = lv;
    if (finite(x)) xp[id] = x;
  }
  s.skills = skills;
  s.xp = xp;
  s.items = Array.isArray(r.items) ? [...new Set(r.items.filter((i): i is ItemId => ITEM_IDS.includes(i as ItemId)))] : [];

  const biz: Record<string, number> = {};
  for (const [id, v] of Object.entries(r.biz ?? {})) if (isBizId(id) && Number.isInteger(v) && v > 0) biz[id] = v;
  s.biz = biz;
  const counts: Record<string, number> = {};
  for (const [id, v] of Object.entries(r.jobCounts ?? {})) if (isJobId(id) && Number.isInteger(v) && v > 0) counts[id] = v;
  s.jobCounts = counts;
  const flags: Record<string, number> = {};
  for (const [k, v] of Object.entries(r.flags ?? {})) if (k.length <= 40 && finite(v)) flags[k] = v;
  s.flags = flags;
  s.stats = { ...base.stats };
  for (const k of Object.keys(base.stats) as (keyof typeof base.stats)[]) {
    const v = (r.stats as Record<string, unknown> | undefined)?.[k];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) s.stats[k] = v;
  }
  for (const k of ['launches', 'launchOk', 'launchFail', 'eraLaunchOk', 'colonists'] as const) {
    if (!Number.isInteger(s[k]) || s[k] < 0) s[k] = 0;
  }
  s.seen = Array.isArray(r.seen) ? r.seen.filter(isEventId).slice(-50) : [];
  if (s.event && !isEventId(s.event)) s.event = null;
  if (s.job && !(isJobId(s.job.id) && finite(s.job.startedAt))) s.job = null;
  if (s.boost && !(finite(s.boost.mult) && finite(s.boost.until))) s.boost = null;
  s.daily = { ...base.daily, ...(r.daily ?? {}) };
  return s;
}

// ------------------------------------------------------------ randomness ---

/** mulberry32: tiny deterministic PRNG whose whole state is one uint32. */
export function nextRand(s: GameState): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// --------------------------------------------------------------- derived ---

export const absMinute = (s: GameState) => s.day * 1440 + s.minute;
export const hourOf = (s: GameState) => s.minute / 60;

/** Age grows 1 year every DAYS_PER_YEAR game days, kept inside the current life chapter. */
export function age(s: GameState): number {
  const raw = START_AGE + Math.floor((s.day - 1) / DAYS_PER_YEAR);
  return clamp(raw, ERAS[s.era].startAge, ERAS[s.era].endAge);
}

/** Days left until the next birthday. */
export function daysToBirthday(s: GameState): number {
  return DAYS_PER_YEAR - ((s.day - 1) % DAYS_PER_YEAR);
}

export function energyMax(s: GameState): number {
  return 100 + 6 * s.skills.fit;
}

export function xpNeeded(level: number): number {
  return Math.round(30 * Math.pow(1.7, level));
}

export function levelMult(level: number): number {
  let m = 1;
  for (const x of LEVEL_MILESTONES) if (level >= x) m *= 2;
  return m;
}

export function bizIncome(id: string, level: number): number {
  if (!isBizId(id) || level <= 0) return 0;
  return BIZ_BY_ID[id].baseIncome * level * levelMult(level) * INCOME_SCALE;
}

/** Price of buying the next level when the business is at `level`. */
export function bizCost(id: string, level: number): number {
  return Math.round(BIZ_BY_ID[id].baseCost * Math.pow(1.15, level));
}

export function repMult(s: GameState): number {
  return 0.75 + s.reputation / 200;
}

/** Passive $/real hour without temporary boosts. */
export function incomePerHour(s: GameState): number {
  let sum = 0;
  for (const id in s.biz) sum += bizIncome(id, s.biz[id]);
  return sum * (1 + 0.05 * s.skills.biz) * repMult(s);
}

export function boostMult(s: GameState, at: number): number {
  return s.boost && at < s.boost.until ? s.boost.mult : 1;
}

export function netWorth(s: GameState): number {
  return s.cash + s.spent;
}

/** One era wage: scales event rewards so they stay meaningful in every era. */
export function unit(s: GameState): number {
  return Math.max(incomePerHour(s), ERAS[s.era].unit);
}

export const hasItem = (s: GameState, id: ItemId) => s.items.includes(id);

export function moveSpeed(s: GameState): number {
  const base = 4.2 + 0.15 * s.skills.fit;
  if (hasItem(s, 'car') && s.era >= 2) return 15;
  if (hasItem(s, 'scooter')) return 10;
  if (hasItem(s, 'bike')) return 7.5;
  return base;
}

export function isOpen(b: Building, minute: number): boolean {
  const h = minute / 60;
  return h >= b.open[0] && h < b.open[1];
}

export function buildingAvailable(s: GameState, id: string): boolean {
  if (!isBuildingId(id)) return false;
  const b = BUILDING_BY_ID[id as Building['id']];
  return s.era >= b.minEra && s.era <= b.maxEra;
}

/** First unmet requirement as a code the UI can explain, e.g. "age:13", "item:bike", "skill:code:2". */
export function requirementBlocker(s: GameState, r: Requirements): string | null {
  if (r.minAge && age(s) < r.minAge) return `age:${r.minAge}`;
  for (const it of r.items ?? []) if (!hasItem(s, it)) return `item:${it}`;
  if (r.anyItem && !r.anyItem.some((it) => hasItem(s, it))) return `anyItem:${r.anyItem.join('|')}`;
  for (const [k, v] of Object.entries(r.skills ?? {})) if (s.skills[k as SkillId] < (v ?? 0)) return `skill:${k}:${v}`;
  return null;
}

function timeBlocker(s: GameState, buildingId: string, minutes: number): string | null {
  const b = BUILDING_BY_ID[buildingId as Building['id']];
  if (!b || !buildingAvailable(s, buildingId)) return 'unavailable';
  if (!isOpen(b, s.minute)) return `closed:${b.open[0]}:${b.open[1]}`;
  if (s.minute + minutes > LAST_MINUTE) return 'late';
  return null;
}

export function jobPayMult(s: GameState, job: Job): number {
  const skill = job.skill ? s.skills[job.skill] : 0;
  return (1 + 0.04 * skill) * (0.9 + s.reputation / 500);
}

/** Why a job can't be started right now, or null. */
export function jobBlocker(s: GameState, job: Job): string | null {
  if (s.era < job.eras[0] || s.era > job.eras[1]) return 'era';
  if (job.once && (s.jobCounts[job.id] ?? 0) > 0) return 'done';
  const req = requirementBlocker(s, job);
  if (req) return req;
  const tb = timeBlocker(s, job.building, job.hours * 60);
  if (tb) return tb;
  if (s.health < 20) return 'sick';
  if (s.hunger < 10) return 'hungry';
  if (s.energy < job.energy) return 'energy';
  return null;
}

export function shopPrice(s: GameState, id: string): number {
  const it = SHOP_BY_ID[id];
  if (id === 'treatment') return Math.round(Math.max(it.price, ERAS[s.era].hospital * 0.4));
  return it.price;
}

export function shopBlocker(s: GameState, id: string): string | null {
  const it = SHOP_BY_ID[id];
  if (s.era < it.eras[0] || s.era > it.eras[1]) return 'era';
  if (it.item && hasItem(s, it.item)) return 'owned';
  if (it.oncePerDay && s.flags[`d:${id}`] === s.day) return 'today';
  const req = requirementBlocker(s, it);
  if (req) return req;
  const tb = timeBlocker(s, it.building, it.minutes ?? 15);
  if (tb) return tb;
  if (s.cash < shopPrice(s, id)) return 'cash';
  return null;
}

export function studyBlocker(s: GameState, id: string): string | null {
  const st = STUDY_BY_ID[id];
  if (s.era < st.eras[0] || s.era > st.eras[1]) return 'era';
  const req = requirementBlocker(s, st);
  if (req) return req;
  const tb = timeBlocker(s, st.building, st.hours * 60);
  if (tb) return tb;
  if (s.health < 20) return 'sick';
  if (s.energy < st.energy) return 'energy';
  if (s.cash < st.price) return 'cash';
  return null;
}

export function sleepBlocker(s: GameState, at: number): string | null {
  if (s.minute < NIGHT_FROM && s.energy > SLEEP_MAX_ENERGY && s.health >= 30) return 'not_tired';
  if (at - s.lastSleepAt < MIN_SLEEP_GAP_MS) return 'too_soon';
  return null;
}

export function launchCost(s: GameState): number {
  return Math.round(ERAS[s.era].launchCost * Math.pow(1.2, s.eraLaunchOk));
}

export function launchChance(s: GameState): number {
  return Math.min(0.95, 0.1 + 0.18 * s.launchFail + 0.04 * s.skills.eng + 0.03 * s.rd);
}

/** Returns an error code, or null when a launch is possible right now. */
export function launchBlocker(s: GameState, at: number): string | null {
  if (s.era < 4) return 'era';
  if ((s.biz.orbitra ?? 0) < 1 && (s.biz.starship ?? 0) < 1) return 'needs_orbitra';
  if (at < s.nextLaunchAt) return 'cooldown';
  if (s.cash < launchCost(s)) return 'cash';
  return null;
}

export function utcDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

export function dailyReward(s: GameState, at: number): { amount: number; streak: number } | null {
  const today = utcDay(at);
  if (s.daily.day === today) return null;
  const yesterday = utcDay(at - 86_400_000);
  const streak = s.daily.day === yesterday ? Math.min(s.daily.streak + 1, DAILY_UNITS.length) : 1;
  const amount = Math.max(3, Math.round(DAILY_UNITS[streak - 1] * ERAS[s.era].unit));
  return { amount, streak };
}

// ---------------------------------------------------------------- quests ---

export function currentQuest(s: GameState): Quest | null {
  const q = QUESTS[s.quest];
  return q && q.era === s.era ? q : null;
}

export interface CondPart {
  key: string;
  have: number;
  need: number;
  label?: string;
}

/** Progress of every requirement of a condition, for the tutorial tracker. */
export function condParts(s: GameState, c: Cond): CondPart[] {
  const parts: CondPart[] = [];
  if (c.flag) parts.push({ key: 'flag', have: s.flags[c.flag] ? 1 : 0, need: 1, label: c.flag });
  if (c.cash !== undefined) parts.push({ key: 'cash', have: s.cash, need: c.cash });
  if (c.netWorth !== undefined) parts.push({ key: 'netWorth', have: netWorth(s), need: c.netWorth });
  if (c.item) parts.push({ key: 'item', have: hasItem(s, c.item) ? 1 : 0, need: 1, label: c.item });
  for (const [k, v] of Object.entries(c.skills ?? {})) parts.push({ key: 'skill', have: s.skills[k as SkillId], need: v ?? 0, label: k });
  if (c.job) parts.push({ key: 'job', have: s.jobCounts[c.job[0]] ?? 0, need: c.job[1], label: c.job[0] });
  if (c.jobs !== undefined) parts.push({ key: 'jobs', have: s.stats.jobs, need: c.jobs });
  if (c.meals !== undefined) parts.push({ key: 'meals', have: s.stats.meals, need: c.meals });
  if (c.sleeps !== undefined) parts.push({ key: 'sleeps', have: s.stats.sleeps, need: c.sleeps });
  if (c.age !== undefined) parts.push({ key: 'age', have: age(s), need: c.age });
  if (c.bizTotal !== undefined) parts.push({ key: 'bizTotal', have: Object.values(s.biz).reduce((a, b) => a + b, 0), need: c.bizTotal });
  if (c.bizId) parts.push({ key: 'bizId', have: s.biz[c.bizId[0]] ?? 0, need: c.bizId[1], label: c.bizId[0] });
  if (c.launchOk !== undefined) parts.push({ key: 'launchOk', have: s.launchOk, need: c.launchOk });
  if (c.colonists !== undefined) parts.push({ key: 'colonists', have: s.colonists, need: c.colonists });
  return parts;
}

export function questReady(s: GameState): boolean {
  const q = currentQuest(s);
  if (!q) return false;
  if (q.cost && s.cash < q.cost) return false;
  return condParts(s, q.cond).every((p) => p.have >= p.need);
}

// ------------------------------------------------------------------ time ---

function emptySummary(): EffectSummary {
  return { cash: 0, rep: 0, energy: 0, health: 0, hunger: 0, rd: 0, xp: {}, levelUps: [], boost: null, minutes: 0 };
}

/**
 * Real-time clock: accrues business income (capped while offline) and
 * expires boosts. Never moves backwards. Does NOT move the game calendar.
 */
export function advance(s: GameState, at: number): void {
  if (!(at > s.lastTick)) return;
  const t0 = s.lastTick;
  const effective = Math.min(at - t0, OFFLINE_CAP_MS);
  const ratePerMs = incomePerHour(s) / 3_600_000;
  if (ratePerMs > 0) {
    let earned = ratePerMs * effective;
    if (s.boost && s.boost.until > t0) {
      const overlap = Math.max(0, Math.min(t0 + effective, s.boost.until) - t0);
      earned += ratePerMs * (s.boost.mult - 1) * overlap;
    }
    s.cash += earned;
    s.totalEarned += earned;
  }
  if (s.boost && s.boost.until <= at) s.boost = null;
  s.lastTick = at;
  checkBillionaire(s, at);
}

/**
 * Moves the game calendar forward. `mode` decides how needs decay:
 * awake (errands), work (costs already paid by the job) or sleep.
 */
function passTime(s: GameState, minutes: number, mode: 'awake' | 'work' | 'sleep', sum: EffectSummary): void {
  const h = minutes / 60;
  const before = { energy: s.energy, hunger: s.hunger, health: s.health };
  if (mode === 'awake') {
    s.hunger -= 5 * h;
    s.energy -= 2 * h;
  } else if (mode === 'sleep') {
    s.hunger -= 2.5 * h;
  }
  s.hunger = clamp(s.hunger, 0, 100);
  if (s.hunger <= 0) s.health -= 7 * h;
  else if (mode === 'sleep' && s.hunger >= 40) s.health += 2 * h;
  s.health = clamp(s.health, 0, 100);
  s.energy = clamp(s.energy, 0, energyMax(s));
  s.minute += Math.round(minutes);
  while (s.minute >= 1440) {
    s.minute -= 1440;
    s.day += 1;
  }
  sum.minutes += Math.round(minutes);
  sum.energy += s.energy - before.energy;
  sum.hunger += s.hunger - before.hunger;
  sum.health += s.health - before.health;
  if (!s.event && absMinute(s) >= s.nextEventAt) {
    const id = pickEvent(s);
    if (id) s.event = id;
    s.nextEventAt = absMinute(s) + (id ? 26 : 8) * 60;
  }
  if (s.health <= 0) hospitalize(s, sum);
}

/** You collapsed: wake up in hospital the next morning with a bill (can push you into debt). */
function hospitalize(s: GameState, sum: EffectSummary): void {
  const bill = ERAS[s.era].hospital;
  s.cash -= bill;
  sum.cash -= bill;
  s.stats.hospital += 1;
  s.reputation = clamp(s.reputation - 5, 0, 100);
  s.day += 1;
  s.minute = 10 * 60;
  s.health = 45;
  s.hunger = 50;
  s.energy = Math.min(energyMax(s), 50);
  s.job = null;
}

function gainXp(s: GameState, skill: SkillId, amount: number, sum: EffectSummary): void {
  if (amount <= 0) return;
  s.xp[skill] += amount;
  sum.xp[skill] = (sum.xp[skill] ?? 0) + amount;
  while (s.xp[skill] >= xpNeeded(s.skills[skill])) {
    s.xp[skill] -= xpNeeded(s.skills[skill]);
    s.skills[skill] += 1;
    sum.levelUps.push(skill);
  }
}

function pickEvent(s: GameState): string | null {
  const recent = new Set(s.seen.slice(-6));
  const pool = EVENTS.filter(
    (e) =>
      s.era >= e.minEra &&
      s.era <= e.maxEra &&
      !(e.once && s.seen.includes(e.id)) &&
      !recent.has(e.id) &&
      (!e.requiresBiz || (s.biz[e.requiresBiz] ?? 0) > 0) &&
      (!e.requiresFails || s.launchFail >= e.requiresFails),
  );
  if (pool.length === 0) return null;
  return pool[Math.floor(nextRand(s) * pool.length)].id;
}

function checkBillionaire(s: GameState, at: number): void {
  if (s.billionaireAt === null && netWorth(s) >= 1e9) s.billionaireAt = at;
}

// ---------------------------------------------------------------- effects --

export function applyEffects(s: GameState, e: Effects, at: number, sum = emptySummary()): EffectSummary {
  let cash = 0;
  if (e.money) cash += e.money * unit(s);
  if (e.cashPct) cash += e.cashPct * Math.max(0, s.cash);
  cash = Math.round(cash);
  if (cash < 0 && s.cash + cash < 0) cash = -Math.max(0, s.cash);
  s.cash += cash;
  if (cash > 0) s.totalEarned += cash;
  sum.cash += cash;

  const before = { rep: s.reputation, energy: s.energy, health: s.health };
  if (e.rep) s.reputation = clamp(s.reputation + e.rep, 0, 100);
  if (e.energy) s.energy = clamp(s.energy + e.energy, 0, energyMax(s));
  if (e.health) s.health = clamp(s.health + e.health, 1, 100);
  sum.rep += s.reputation - before.rep;
  sum.energy += s.energy - before.energy;
  sum.health += s.health - before.health;

  if (e.rd) {
    s.rd += e.rd;
    sum.rd += e.rd;
  }
  if (e.boost) {
    const until = at + e.boost.minutes * 60_000;
    const active = s.boost && s.boost.until > at ? s.boost : null;
    // Never let a weaker or shorter boost wipe out a better one that is still running.
    if (!active || e.boost.mult > active.mult) s.boost = { mult: e.boost.mult, until };
    else if (e.boost.mult === active.mult) active.until = Math.max(active.until, until);
    sum.boost = e.boost;
  }
  return sum;
}

// ---------------------------------------------------------------- actions --

const fail = (err: string): Outcome => ({ ok: false, err });

export function sanitizeName(name: string): string {
  return String(name ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, 24);
}

/** Applies one player action at real time `a.at`. */
export function applyAction(s: GameState, a: Action): Outcome {
  advance(s, a.at);
  const at = s.lastTick;
  const sum = emptySummary();
  switch (a.t) {
    case 'visit': {
      if (!isBuildingId(a.b) || !buildingAvailable(s, a.b)) return fail('unknown');
      s.flags[`v:${a.b}`] = 1;
      return { ok: true };
    }
    case 'jobStart': {
      if (!isJobId(a.id)) return fail('unknown');
      const blocker = jobBlocker(s, JOB_BY_ID[a.id]);
      if (blocker) return fail(blocker);
      s.job = { id: a.id, startedAt: at };
      return { ok: true };
    }
    case 'jobEnd': {
      if (!s.job || s.job.id !== a.id || !isJobId(a.id)) return fail('no_job');
      const job = JOB_BY_ID[a.id];
      if (at - s.job.startedAt < MIN_JOB_MS[job.game]) return fail('too_fast');
      s.job = null;
      if (s.energy < job.energy) return fail('energy');
      const score = clamp(Number(a.score) || 0, 0, 1);
      const quality = score >= 0.3 ? 0.4 + 0.6 * score : 0.15;
      const pay = Math.round(job.pay * quality * jobPayMult(s, job));
      s.cash += pay;
      s.totalEarned += pay;
      sum.cash += pay;
      s.energy = clamp(s.energy - job.energy, 0, energyMax(s));
      s.hunger = clamp(s.hunger - job.hunger, 0, 100);
      sum.energy -= job.energy;
      sum.hunger -= job.hunger;
      for (const [k, v] of Object.entries(job.xp ?? {})) gainXp(s, k as SkillId, Math.round((v ?? 0) * (0.5 + 0.5 * score)), sum);
      if (job.rd && score >= 0.6) {
        s.rd += job.rd;
        sum.rd += job.rd;
      }
      const repDelta = score >= 0.8 ? 1 : score < 0.3 ? -2 : 0;
      s.reputation = clamp(s.reputation + repDelta, 0, 100);
      sum.rep += repDelta;
      s.jobCounts[job.id] = (s.jobCounts[job.id] ?? 0) + 1;
      s.stats.jobs += 1;
      passTime(s, job.hours * 60, 'work', sum);
      checkBillionaire(s, at);
      return { ok: true, score, summary: sum };
    }
    case 'study': {
      if (!isStudyId(a.id)) return fail('unknown');
      const blocker = studyBlocker(s, a.id);
      if (blocker) return fail(blocker);
      const st = STUDY_BY_ID[a.id];
      s.cash -= st.price;
      sum.cash -= st.price;
      s.energy = clamp(s.energy - st.energy, 0, energyMax(s));
      s.hunger = clamp(s.hunger - st.hunger, 0, 100);
      sum.energy -= st.energy;
      sum.hunger -= st.hunger;
      gainXp(s, st.skill, st.xp, sum);
      s.stats.studies += 1;
      passTime(s, st.hours * 60, 'work', sum);
      return { ok: true, summary: sum };
    }
    case 'buy': {
      if (!isShopId(a.id)) return fail('unknown');
      const blocker = shopBlocker(s, a.id);
      if (blocker) return fail(blocker);
      const it = SHOP_BY_ID[a.id];
      const price = shopPrice(s, a.id);
      s.cash -= price;
      sum.cash -= price;
      if (it.item) s.items.push(it.item);
      if (it.oncePerDay) s.flags[`d:${a.id}`] = s.day;
      if (it.hunger || it.energy || it.health) {
        const b = { hunger: s.hunger, energy: s.energy, health: s.health };
        s.hunger = clamp(s.hunger + (it.hunger ?? 0), 0, 100);
        s.energy = clamp(s.energy + (it.energy ?? 0), 0, energyMax(s));
        s.health = clamp(s.health + (it.health ?? 0), 1, 100);
        sum.hunger += s.hunger - b.hunger;
        sum.energy += s.energy - b.energy;
        sum.health += s.health - b.health;
        if (it.hunger) s.stats.meals += 1;
      }
      passTime(s, it.minutes ?? 15, 'awake', sum);
      return { ok: true, summary: sum };
    }
    case 'sleep': {
      const blocker = sleepBlocker(s, at);
      if (blocker) return fail(blocker);
      if (s.minute >= NIGHT_FROM || s.energy < 15) {
        const mins = 1440 - s.minute + WAKE_MINUTE;
        passTime(s, mins, 'sleep', sum);
        const e = s.energy;
        s.energy = energyMax(s);
        sum.energy += s.energy - e;
        const rent = ERAS[s.era].rent;
        if (rent) {
          s.cash -= rent;
          sum.cash -= rent;
        }
        if (s.cash < 0) {
          const interest = Math.round(-s.cash * DEBT_INTEREST);
          s.cash -= interest;
          sum.cash -= interest;
        }
        s.stats.sleeps += 1;
      } else {
        passTime(s, 180, 'sleep', sum);
        const e = s.energy;
        s.energy = clamp(s.energy + 35, 0, energyMax(s));
        sum.energy += s.energy - e;
      }
      s.lastSleepAt = at;
      return { ok: true, summary: sum };
    }
    case 'rest': {
      if (s.minute + REST_MINUTES > LAST_MINUTE) return fail('late');
      passTime(s, REST_MINUTES, 'awake', sum);
      const e = s.energy;
      s.energy = clamp(s.energy + 12, 0, energyMax(s));
      sum.energy += s.energy - e;
      return { ok: true, summary: sum };
    }
    case 'invest': {
      if (!isBizId(a.id)) return fail('unknown');
      const b = BIZ_BY_ID[a.id];
      if (b.era > s.era) return fail('locked');
      const level = s.biz[a.id] ?? 0;
      const cost = bizCost(a.id, level);
      if (s.cash < cost) return fail('cash');
      s.cash -= cost;
      s.spent += cost;
      s.biz[a.id] = level + 1;
      return { ok: true };
    }
    case 'quest': {
      const q = currentQuest(s);
      if (!q || !questReady(s)) return fail('not_ready');
      if (q.cost) {
        s.cash -= q.cost;
        sum.cash -= q.cost;
      }
      if (q.reward?.cash) {
        s.cash += q.reward.cash;
        s.totalEarned += q.reward.cash;
        sum.cash += q.reward.cash;
      }
      if (q.reward?.item && !hasItem(s, q.reward.item)) s.items.push(q.reward.item);
      if (q.advanceEra && s.era < LAST_ERA) {
        const bonus = ERAS[s.era].milestone?.cashBonus ?? 0;
        s.era += 1;
        s.cash += bonus;
        s.totalEarned += bonus;
        sum.cash += bonus;
        s.eraLaunchOk = 0;
        s.reputation = clamp(s.reputation + 10, 0, 100);
        for (const k of Object.keys(s.flags)) if (k.startsWith('v:')) delete s.flags[k];
      }
      s.quest += 1;
      checkBillionaire(s, at);
      return { ok: true, summary: sum };
    }
    case 'choose': {
      if (!s.event || s.event !== a.id || !isEventId(a.id)) return fail('no_event');
      const ev = EVENT_BY_ID[a.id];
      const choice = Number.isInteger(a.c) && a.c >= 0 ? ev.choices[a.c] : undefined;
      if (!choice) return fail('bad_choice');
      let win: boolean | undefined;
      let effects: Effects = choice.effects ?? {};
      if (choice.risk) {
        win = nextRand(s) < choice.risk.chance;
        effects = win ? choice.risk.win : choice.risk.lose;
      }
      applyEffects(s, effects, at, sum);
      s.seen.push(ev.id);
      if (s.seen.length > 50) s.seen = s.seen.slice(-50);
      s.event = null;
      checkBillionaire(s, at);
      return { ok: true, win, summary: sum };
    }
    case 'launch': {
      const blocker = launchBlocker(s, at);
      if (blocker) return fail(blocker);
      const cost = launchCost(s);
      const chance = launchChance(s);
      s.cash -= cost;
      s.launches += 1;
      s.nextLaunchAt = at + LAUNCH_COOLDOWN_MS;
      const win = nextRand(s) < chance;
      if (win) {
        s.launchOk += 1;
        s.eraLaunchOk += 1;
        if (s.era === LAST_ERA) s.colonists += 100;
        const reward = cost * 2;
        s.cash += reward;
        s.totalEarned += reward;
        applyEffects(s, { rep: 10, boost: { mult: 2, minutes: 30 } }, at, sum);
        sum.cash = reward - cost;
      } else {
        s.launchFail += 1;
        applyEffects(s, { rep: -5 }, at, sum);
        sum.cash = -cost;
      }
      checkBillionaire(s, at);
      return { ok: true, win, summary: sum };
    }
    case 'daily': {
      const r = dailyReward(s, at);
      if (!r) return fail('claimed');
      s.cash += r.amount;
      s.totalEarned += r.amount;
      s.daily = { day: utcDay(at), streak: r.streak };
      sum.cash = r.amount;
      return { ok: true, summary: sum };
    }
    case 'name': {
      const name = sanitizeName(a.name);
      if (!name) return fail('bad_name');
      s.name = name;
      return { ok: true };
    }
    default:
      return fail('unknown_action');
  }
}

/**
 * Replays client actions on the authoritative state. Timestamps are clamped
 * into [lastTick, now] so a client can never claim time it did not spend.
 */
export function replayActions(
  s: GameState,
  actions: Action[],
  now: number,
): { applied: number; rejected: number } {
  let applied = 0;
  let rejected = 0;
  for (const raw of actions) {
    if (!raw || typeof raw !== 'object' || typeof raw.t !== 'string') {
      rejected++;
      continue;
    }
    const at = clamp(Number(raw.at) || 0, s.lastTick, now);
    const r = applyAction(s, { ...raw, at } as Action);
    if (r.ok) applied++;
    else rejected++;
  }
  advance(s, now);
  return { applied, rejected };
}

/** Referral bonus: `count` invites worth two era wages each. */
export function grantReferralBonus(s: GameState, count: number): number {
  if (count <= 0) return 0;
  const amount = Math.round(count * Math.max(20, 2 * unit(s)));
  s.cash += amount;
  s.totalEarned += amount;
  return amount;
}
