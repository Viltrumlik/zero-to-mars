import { create } from 'zustand';
import {
  MIN_JOB_MS,
  advance,
  applyAction,
  cloneState,
  currentQuest,
  dailyReward,
  incomePerHour,
  newGame,
  normalizeState,
  questReady,
} from '../../shared/src/engine.ts';
import { JOB_BY_ID } from '../../shared/src/content/city.ts';
import { ERAS } from '../../shared/src/content/eras.ts';
import type { Action, BuildingId, EffectSummary, GameState, Lang, MiniGameKind, Outcome } from '../../shared/src/types.ts';
import { money } from '../../shared/src/format.ts';
import { ApiError, api } from './api.ts';
import { pickLang, tr, type StrKey } from './i18n.ts';
import { input } from './input.ts';
import { setSoundEnabled, sfx } from './sound.ts';
import { haptic, initTelegram, startParam, telegramUser } from './telegram.ts';
import { DROP_POINTS, LOT_BY_ID, findPath } from './scene/cityLayout.ts';

export type Tab = 'city' | 'me' | 'biz' | 'top' | 'friends';

export type Modal =
  | { kind: 'intro' }
  | { kind: 'quest' }
  | { kind: 'milestone' }
  | { kind: 'eraIntro'; era: number }
  | { kind: 'event' }
  | { kind: 'outcome'; icon: string; title: string; text?: string; win?: boolean; summary?: EffectSummary }
  | { kind: 'jobResult'; jobId: string; score: number; summary: EffectSummary }
  | { kind: 'sleep'; summary: EffectSummary; day: number }
  | { kind: 'hospital'; bill: number }
  | { kind: 'offline'; earned: number; ms: number }
  | { kind: 'daily' }
  | { kind: 'settings' }
  | { kind: 'help' }
  | { kind: 'billionaire' };

export type TipId = 'move' | 'quest' | 'enter' | 'needs' | 'route' | 'biz' | 'hungry' | 'tired' | 'late' | 'sick' | 'debt';

export interface ActiveJob {
  id: string;
  kind: Exclude<MiniGameKind, 'route'>;
  difficulty: number;
  seed: number;
  startedAt: number;
}

export interface Route {
  jobId: string;
  stops: [number, number][];
  done: number;
  startedAt: number;
  limitMs: number;
}

export interface LaunchAnim {
  id: number;
  win: boolean;
  summary: EffectSummary;
}

export type Preset = 'low' | 'medium' | 'high' | 'ultra';
export interface Gfx {
  preset: Preset | 'custom';
  /** 0 off, 1 soft 1024px, 2 crisp 2048px */
  shadows: 0 | 1 | 2;
  bloom: boolean;
  /** Render resolution multiplier (capped by the screen's pixel ratio). */
  res: number;
  /** View distance: 0 near, 1 medium, 2 far. */
  distance: 0 | 1 | 2;
  /** Cars and pedestrians: 0 few, 1 normal, 2 many. */
  traffic: 0 | 1 | 2;
  fps: boolean;
  auto: boolean;
}

export const GFX_PRESETS: Record<Preset, Pick<Gfx, 'shadows' | 'bloom' | 'res' | 'distance' | 'traffic'>> = {
  low: { shadows: 0, bloom: false, res: 0.7, distance: 0, traffic: 0 },
  medium: { shadows: 0, bloom: false, res: 1, distance: 1, traffic: 1 },
  high: { shadows: 1, bloom: true, res: 1.5, distance: 2, traffic: 1 },
  ultra: { shadows: 2, bloom: true, res: 2, distance: 2, traffic: 2 },
};

function defaultGfx(): Gfx {
  const touch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  const preset: Preset = touch ? 'medium' : 'high';
  return { preset, ...GFX_PRESETS[preset], fps: false, auto: true };
}
type ActInput = Action extends infer A ? (A extends { at: number } ? Omit<A, 'at'> : never) : never;

interface Store {
  ready: boolean;
  online: boolean;
  lang: Lang;
  gfx: Gfx;
  sound: boolean;
  s: GameState;
  tab: Tab;
  modals: Modal[];
  toast: { id: number; text: string; kind: 'ok' | 'err' } | null;
  near: BuildingId | null;
  building: BuildingId | null;
  activeJob: ActiveJob | null;
  route: Route | null;
  launchAnim: LaunchAnim | null;
  eraFx: number;
  inviteLink: string;
  cinematic: boolean;
  tip: TipId | null;
}

const STORAGE_KEY = 'ztm_state_v1';
const PREFS_KEY = 'ztm_prefs_v1';
const TIPS_KEY = 'ztm_tips';

let queue: Action[] = [];
let inflight = false;
let offsetMs = 0;
let lastPersist = 0;
let questBusy = false;
const warned = new Set<string>();

export const now = () => Date.now() + offsetMs;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be blocked */
  }
}

const prefs = readJson<Partial<Pick<Store, 'lang' | 'gfx' | 'sound'>>>(PREFS_KEY, {});
const seenTips = new Set<TipId>(readJson<TipId[]>(TIPS_KEY, []));

export const useGame = create<Store>(() => ({
  ready: false,
  online: false,
  lang: prefs.lang ?? pickLang(telegramUser()?.language_code ?? navigator.language),
  gfx: { ...defaultGfx(), ...(prefs.gfx ?? {}) },
  sound: prefs.sound ?? true,
  s: newGame(Date.now(), 1),
  tab: 'city',
  modals: [],
  toast: null,
  near: null,
  building: null,
  activeJob: null,
  route: null,
  launchAnim: null,
  eraFx: 0,
  inviteLink: '',
  cinematic: false,
  tip: null,
}));

setSoundEnabled(useGame.getState().sound);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__ztm = { useGame, act, cloneState, input };
}

export function useT() {
  const lang = useGame((st) => st.lang);
  return (key: StrKey, vars?: Record<string, string | number>) => tr(lang, key, vars);
}

export function t(key: StrKey, vars?: Record<string, string | number>) {
  return tr(useGame.getState().lang, key, vars);
}

export function fmt(v: number) {
  return money(v, useGame.getState().lang);
}

function persist(force = false) {
  const ts = Date.now();
  if (!force && ts - lastPersist < 4000) return;
  lastPersist = ts;
  writeJson(STORAGE_KEY, { s: useGame.getState().s, queue });
}

// ------------------------------------------------------------- ui helpers --

export function showToast(text: string, kind: 'ok' | 'err' = 'ok') {
  const id = Date.now() + Math.random();
  useGame.setState({ toast: { id, text, kind } });
  setTimeout(() => {
    if (useGame.getState().toast?.id === id) useGame.setState({ toast: null });
  }, 2600);
}

export function pushModal(m: Modal) {
  useGame.setState((st) => (st.modals.some((x) => x.kind === m.kind && m.kind !== 'outcome') ? st : { modals: [...st.modals, m] }));
}

export function closeModal() {
  useGame.setState((st) => ({ modals: st.modals.slice(1) }));
}

export function setTab(tab: Tab) {
  haptic('select');
  useGame.setState((st) => ({ tab: st.tab === tab && tab !== 'city' ? 'city' : tab, building: null }));
}

export function setPrefs(p: Partial<Pick<Store, 'lang' | 'gfx' | 'sound'>>) {
  useGame.setState(p);
  const { lang, gfx, sound } = useGame.getState();
  setSoundEnabled(sound);
  writeJson(PREFS_KEY, { lang, gfx, sound });
}

/** Apply a graphics preset, or tweak one option (which turns the preset into "custom"). */
export function setGfx(change: Partial<Gfx>) {
  const cur = useGame.getState().gfx;
  const next: Gfx =
    change.preset && change.preset !== 'custom'
      ? { ...cur, ...GFX_PRESETS[change.preset], preset: change.preset }
      : { ...cur, ...change, preset: 'fps' in change || 'auto' in change ? cur.preset : 'custom' };
  setPrefs({ gfx: next });
}

/** Turns an engine error code like "skill:code:2" into a friendly sentence. */
export function explain(err: string | null | undefined): string {
  if (!err) return '';
  const [code, a, b] = err.split(':');
  switch (code) {
    case 'age': return t('needAge', { n: a });
    case 'item': return t('needItem', { item: t(`item_${a}` as StrKey) });
    case 'anyItem': return t('needItem', { item: a.split('|').map((x) => t(`item_${x}` as StrKey)).join(' / ') });
    case 'skill': return t('needSkill', { skill: t(`skill_${a}` as StrKey), n: b });
    case 'closed': return t('closedHours', { from: a, to: b === '24' ? '24' : b });
    default: {
      const key = `err_${code}` as StrKey;
      return tr(useGame.getState().lang, key) || t('errGeneric');
    }
  }
}

// ------------------------------------------------------------------ tips ---

export function showTip(id: TipId) {
  if (useGame.getState().tip) return;
  useGame.setState({ tip: id });
}

export function dismissTip() {
  const id = useGame.getState().tip;
  if (id) {
    seenTips.add(id);
    writeJson(TIPS_KEY, [...seenTips]);
  }
  useGame.setState({ tip: null });
}

function checkTips() {
  const st = useGame.getState();
  if (!st.ready || st.tip || st.modals.length || st.activeJob || st.cinematic) return;
  const s = st.s;
  const once = (id: TipId, cond: boolean) => {
    if (cond && !seenTips.has(id)) {
      showTip(id);
      return true;
    }
    return false;
  };
  if (once('move', true)) return;
  if (once('quest', true)) return;
  if (once('enter', !!st.near)) return;
  if (once('needs', s.stats.jobs >= 1)) return;
  if (once('biz', s.era >= 2)) return;
  const warn = (id: TipId, cond: boolean) => {
    const key = `${id}:${s.day}`;
    if (cond && !warned.has(key)) {
      warned.add(key);
      haptic('warning');
      useGame.setState({ tip: id });
      return true;
    }
    return false;
  };
  if (warn('sick', s.health < 35)) return;
  if (warn('hungry', s.hunger < 25)) return;
  if (warn('tired', s.energy < 20)) return;
  if (warn('debt', s.cash < 0)) return;
  warn('late', s.minute >= 21 * 60);
}

// ---------------------------------------------------------------- actions --

const SILENT_ERRORS = new Set(['too_fast', 'no_job']);

/** Applies an action locally (instant feedback) and queues it for the server. */
export function act(inp: ActInput, opts: { silent?: boolean } = {}): Outcome {
  const prev = useGame.getState().s;
  const next = cloneState(prev);
  const a = { ...inp, at: now() } as Action;
  const r = applyAction(next, a);
  if (!r.ok) {
    if (!opts.silent && !SILENT_ERRORS.has(r.err ?? '')) {
      haptic('error');
      sfx.error();
      showToast(explain(r.err), 'err');
    }
    return r;
  }
  queue.push(a);
  useGame.setState({ s: next });
  afterChange(prev, next);
  persist();
  return r;
}

function afterChange(prev: GameState, next: GameState) {
  if (!prev.event && next.event) {
    haptic('warning');
    sfx.event();
  }
  if (next.stats.hospital > prev.stats.hospital) {
    sfx.fail();
    useGame.setState({ building: null, route: null, activeJob: null });
    pushModal({ kind: 'hospital', bill: ERAS[prev.era].hospital });
  }
  if (prev.billionaireAt === null && next.billionaireAt !== null) setTimeout(() => pushModal({ kind: 'billionaire' }), 0);
  if (next.era > prev.era) useGame.setState((st) => ({ eraFx: st.eraFx + 1 }));
  setTimeout(checkQuest, 0);
}

/** Auto-completes finished quests; era-changing ones open the story first. */
export function checkQuest() {
  const st = useGame.getState();
  if (questBusy || !st.ready || !questReady(st.s)) return;
  const q = currentQuest(st.s)!;
  if (q.advanceEra) {
    pushModal({ kind: 'milestone' });
    return;
  }
  questBusy = true;
  const r = act({ t: 'quest' }, { silent: true });
  questBusy = false;
  if (r.ok) {
    sfx.success();
    haptic('success');
    showToast(`✅ ${q.title[st.lang]}`);
    if (currentQuest(useGame.getState().s)) pushModal({ kind: 'quest' });
  }
}

export function claimMilestone() {
  const era = useGame.getState().s.era;
  questBusy = true;
  const r = act({ t: 'quest' });
  questBusy = false;
  closeModal();
  if (r.ok) {
    sfx.success();
    haptic('success');
    input.path = [];
    pushModal({ kind: 'eraIntro', era: era + 1 });
    pushModal({ kind: 'quest' });
  }
}

// ------------------------------------------------------------- the city ---

export function setNear(id: BuildingId | null) {
  useGame.setState({ near: id });
}

/** Walk to a building's door along the streets, then open it. */
export function goTo(id: BuildingId) {
  const st = useGame.getState();
  if (st.modals.length || st.activeJob) return;
  const door = LOT_BY_ID[id].door;
  const from: [number, number] = [input.player.x, input.player.z];
  if (Math.hypot(door[0] - from[0], door[1] - from[1]) < 2.5) {
    openBuilding(id);
    return;
  }
  const path = findPath(st.s.era, from, door);
  if (!path.length) {
    showToast(t('errGeneric'), 'err');
    return;
  }
  haptic('select');
  input.path = path;
  input.arriveAt = id;
  useGame.setState({ building: null, tab: 'city' });
}

export function openBuilding(id: BuildingId) {
  const st = useGame.getState();
  if (st.route || st.activeJob) return;
  input.path = [];
  input.arriveAt = null;
  haptic('light');
  useGame.setState({ building: id, tab: 'city' });
  if (!st.s.flags[`v:${id}`]) act({ t: 'visit', b: id }, { silent: true });
}

export function closeBuilding() {
  useGame.setState({ building: null });
}

// ----------------------------------------------------------------- jobs ---

export function startJob(id: string) {
  const job = JOB_BY_ID[id];
  const r = act({ t: 'jobStart', id });
  if (!r.ok) return;
  haptic('medium');
  const startedAt = now();
  if (job.game === 'route') {
    const stops = pickStops(job.stops ?? 4);
    const limitMs = (stops.length * (13 - job.difficulty) + 8) * 1000;
    useGame.setState({ building: null, route: { jobId: id, stops, done: 0, startedAt, limitMs } });
    showTip('route');
  } else {
    useGame.setState({
      building: null,
      activeJob: { id, kind: job.game, difficulty: job.difficulty, seed: Math.floor(Math.random() * 2 ** 32), startedAt },
    });
  }
}

function pickStops(n: number): [number, number][] {
  const out: [number, number][] = [];
  const pool = DROP_POINTS.filter(([x, z]) => Math.hypot(x - input.player.x, z - input.player.z) > 8);
  let guard = 0;
  while (out.length < n && guard++ < 500) {
    const p = pool[Math.floor(Math.random() * pool.length)];
    const last = out[out.length - 1] ?? [input.player.x, input.player.z];
    const d = Math.hypot(p[0] - last[0], p[1] - last[1]);
    if (d > 9 && d < 40 && !out.includes(p)) out.push(p);
  }
  return out;
}

function completeJob(id: string, score: number, startedAt: number) {
  const wait = MIN_JOB_MS[JOB_BY_ID[id].game] + 300 - (now() - startedAt);
  if (wait > 0) {
    setTimeout(() => completeJob(id, score, startedAt), wait);
    return;
  }
  const r = act({ t: 'jobEnd', id, score });
  if (r.ok && r.summary) {
    sfx.coins();
    haptic(score >= 0.6 ? 'success' : 'warning');
    pushModal({ kind: 'jobResult', jobId: id, score: r.score ?? score, summary: r.summary });
  }
}

export function finishMiniGame(score: number) {
  const job = useGame.getState().activeJob;
  if (!job) return;
  useGame.setState({ activeJob: null });
  completeJob(job.id, score, job.startedAt);
}

export function quitMiniGame() {
  useGame.setState({ activeJob: null });
  showToast(t('jobQuit'), 'err');
}

export function routeHit() {
  const r = useGame.getState().route;
  if (!r) return;
  const done = r.done + 1;
  sfx.coins();
  haptic('light');
  if (done >= r.stops.length) finishRoute(1, { ...r, done });
  else useGame.setState({ route: { ...r, done } });
}

export function finishRoute(score?: number, r = useGame.getState().route) {
  if (!r) return;
  useGame.setState({ route: null });
  completeJob(r.jobId, score ?? r.done / r.stops.length, r.startedAt);
}

// ---------------------------------------------------------- other acts ---

export function sleep() {
  const r = act({ t: 'sleep' });
  if (r.ok && r.summary) {
    sfx.buy();
    useGame.setState({ building: null });
    pushModal({ kind: 'sleep', summary: r.summary, day: useGame.getState().s.day });
  }
}

export function simpleAct(inp: ActInput) {
  const r = act(inp);
  if (r.ok) {
    haptic('medium');
    sfx.buy();
  }
  return r;
}

export function launchRocket() {
  const r = act({ t: 'launch' });
  if (!r.ok) return;
  haptic('heavy');
  sfx.launch();
  useGame.setState({ launchAnim: { id: Date.now(), win: !!r.win, summary: r.summary! }, building: null, tab: 'city' });
}

export function finishLaunch() {
  const anim = useGame.getState().launchAnim;
  if (!anim) return;
  useGame.setState({ launchAnim: null });
  if (anim.win) {
    sfx.success();
    haptic('success');
  }
  pushModal({
    kind: 'outcome',
    icon: anim.win ? '🛰️' : '💥',
    title: t(anim.win ? 'launchWinTitle' : 'launchFailTitle'),
    text: t(anim.win ? 'launchWinText' : 'launchFailText'),
    win: anim.win,
    summary: anim.summary,
  });
}

export function finishIntro(name: string) {
  if (name.trim()) act({ t: 'name', name }, { silent: true });
  useGame.setState({ cinematic: false });
  closeModal();
  pushModal({ kind: 'quest' });
}

// ------------------------------------------------------------------- sync --

async function flush(keepalive = false) {
  const st = useGame.getState();
  if (!st.online || inflight || queue.length === 0) return;
  inflight = true;
  const batch = queue.splice(0, 400);
  try {
    const r = await api.sync(batch, keepalive);
    offsetMs = r.serverTime - Date.now();
    const predicted = cloneState(r.state);
    for (const a of queue) applyAction(predicted, a);
    advance(predicted, now());
    useGame.setState({ s: predicted });
    if (r.referralBonus > 0) showToast(t('referralBonus', { m: fmt(r.referralBonus) }));
  } catch (e) {
    queue = [...batch, ...queue];
    if (e instanceof ApiError && e.status === 401) useGame.setState({ online: false });
  } finally {
    inflight = false;
  }
}

function tick() {
  const st = useGame.getState();
  if (incomePerHour(st.s) > 0 || st.s.boost) {
    const next = cloneState(st.s);
    advance(next, now());
    useGame.setState({ s: next });
    afterChange(st.s, next);
  }
  if (st.route && now() - st.route.startedAt > st.route.limitMs) {
    showToast(t('routeTimeout'), 'err');
    finishRoute();
  }
  checkTips();
  persist();
}

// ------------------------------------------------------------------- boot --

export async function boot() {
  initTelegram();
  const saved = readJson<{ s?: unknown; queue?: Action[] } | null>(STORAGE_KEY, null);
  const modals: Modal[] = [];
  let s: GameState;
  let online = false;
  let inviteLink = '';
  let isNew = false;

  try {
    const r = await api.session(startParam());
    online = true;
    offsetMs = r.serverTime - Date.now();
    s = r.state;
    inviteLink = r.inviteLink ?? '';
    isNew = r.isNew || s.stats.jobs + s.stats.sleeps + s.quest === 0;
    if (Array.isArray(saved?.queue) && saved.queue.length && (saved.s as GameState | undefined)?.v === 2) queue = saved.queue.slice(-400);
    if (r.offline && r.offline.earned >= 1) modals.push({ kind: 'offline', earned: r.offline.earned, ms: r.offline.ms });
    if (r.referralBonus > 0) setTimeout(() => showToast(t('referralBonus', { m: fmt(r.referralBonus) })), 1500);
  } catch {
    const t0 = Date.now();
    s = normalizeState(saved?.s, t0);
    isNew = s.stats.jobs + s.stats.sleeps + s.quest === 0;
    if (!isNew) {
      const before = s.cash;
      const gap = t0 - s.lastTick;
      advance(s, t0);
      if (gap > 60_000 && s.cash - before >= 1) modals.push({ kind: 'offline', earned: s.cash - before, ms: gap });
    } else if (!saved?.s) {
      s = newGame(t0, Math.floor(Math.random() * 2 ** 32), telegramUser()?.first_name ?? '');
    }
  }

  if (isNew) modals.unshift({ kind: 'intro' });
  if (dailyReward(s, now())) modals.push({ kind: 'daily' });
  useGame.setState({ s, online, modals, ready: true, inviteLink, cinematic: isNew });

  setInterval(tick, 250);
  setInterval(() => void flush(), 3000);
  const onHide = () => {
    persist(true);
    void flush(true);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onHide();
  });
  window.addEventListener('pagehide', onHide);
}
