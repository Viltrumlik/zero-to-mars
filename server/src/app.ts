/**
 * HTTP API. The server is authoritative: clients send action logs, the shared
 * engine replays them on the stored state and the result is sent back.
 */
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import Fastify, { LogController } from 'fastify';
import type { FastifyError, FastifyInstance, FastifyRequest, FastifyServerOptions } from 'fastify';
import fastifyStatic from '@fastify/static';
import { advance, grantReferralBonus, newGame, replayActions } from '../../shared/src/engine.ts';
import type { Action, GameState } from '../../shared/src/types.ts';
import { authenticate } from './auth.ts';
import type { TgUser } from './auth.ts';
import type { BoardRow, Db, Profile } from './db.ts';
import { pickLang } from './texts.ts';

export interface AppOptions {
  db: Db;
  botToken?: string;
  botUsername?: string;
  appShortName?: string;
  /** Accept `Authorization: dev <id>:<name>`. Never enable in production. */
  devAuth?: boolean;
  authMaxAgeSec?: number;
  /** Built client (vite output). Skipped when missing. */
  staticDir?: string | null;
  logger?: FastifyServerOptions['logger'];
  /** Minimum gap between two /api/sync calls of one user (default 250 ms). */
  syncMinIntervalMs?: number;
  /** Game clock (tests). Auth always uses the real clock. */
  now?: () => number;
}

export const MAX_SYNC_ACTIONS = 500;
/** Welcome cash for a referred newcomer: about three paper routes in childhood. */
export const REF_JOIN_CASH = 20;
const OFFLINE_REPORT_MS = 60_000;
const LEADERBOARD_SIZE = 100;
const FRIENDS_LIMIT = 200;
const BODY_LIMIT = 256 * 1024;

const STATUS_CODES: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  429: 'too_many_requests',
};

function httpError(statusCode: number, code: string): Error {
  return Object.assign(new Error(code), { statusCode, code });
}

const randomUint32 = (): number => randomBytes(4).readUInt32LE(0);

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Accepts `ref_123`, `"123"` or `123`. */
export function parseRef(v: unknown): number | null {
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string') {
    const m = /^(?:ref_)?(\d{1,16})$/.exec(v.trim());
    if (!m) return null;
    n = Number(m[1]);
  } else return null;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Strict shape check before actions reach the engine, so malformed input
 * (NaN scores, non-integer choice indexes, objects as ids) is rejected
 * instead of corrupting the save. Only known fields are copied. There is no
 * tap/click income: money comes from finished jobs (mini-games) and businesses.
 */
export function cleanAction(raw: unknown): Action | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const at = typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0;
  const id = typeof o.id === 'string' && o.id.length > 0 && o.id.length <= 64 ? o.id : null;
  switch (o.t) {
    case 'visit':
      return typeof o.b === 'string' && o.b.length > 0 && o.b.length <= 32 ? { t: 'visit', b: o.b, at } : null;
    case 'jobStart':
    case 'study':
    case 'buy':
    case 'invest':
      return id ? { t: o.t, id, at } : null;
    case 'jobEnd':
      return id && typeof o.score === 'number' && Number.isFinite(o.score)
        ? { t: 'jobEnd', id, score: o.score, at }
        : null;
    case 'choose':
      return id && typeof o.c === 'number' && Number.isInteger(o.c) && o.c >= 0 && o.c < 32
        ? { t: 'choose', id, c: o.c, at }
        : null;
    case 'sleep':
    case 'rest':
    case 'quest':
    case 'launch':
    case 'daily':
      return { t: o.t, at };
    case 'name':
      return typeof o.name === 'string' && o.name.length <= 256 ? { t: 'name', name: o.name, at } : null;
    default:
      return null;
  }
}

/** Standard competition ranking over rows already sorted by net worth desc. */
function withRanks(rows: BoardRow[]): Array<BoardRow & { rank: number }> {
  const out: Array<BoardRow & { rank: number }> = [];
  rows.forEach((r, i) => {
    const prev = out[i - 1];
    out.push({ ...r, rank: prev && prev.netWorth === r.netWorth ? prev.rank : i + 1 });
  });
  return out;
}

export function buildApp(opts: AppOptions): FastifyInstance {
  const { db } = opts;
  const clock = opts.now ?? Date.now;
  const botUsername = (opts.botUsername ?? '').replace(/^@/, '');
  const appShortName = opts.appShortName ?? '';
  const minSyncGap = opts.syncMinIntervalMs ?? 250;
  const authCfg = {
    botToken: opts.botToken ?? '',
    devAuth: opts.devAuth === true,
    maxAgeSec: opts.authMaxAgeSec ?? 86_400,
  };

  const app = Fastify({
    logger: opts.logger ?? false,
    bodyLimit: BODY_LIMIT,
    trustProxy: true,
    // Per-request logs are emitted by the onResponse hook below (errors at info+, rest at debug).
    logController: new LogController({ disableRequestLogging: true }),
  });

  // ------------------------------------------------------------ helpers ---

  const requireUser = (req: FastifyRequest): TgUser => {
    const u = authenticate(req.headers.authorization, authCfg, Date.now());
    if (!u) throw httpError(401, 'unauthorized');
    return u;
  };

  const toProfile = (u: TgUser): Profile => ({
    id: u.id,
    firstName: u.firstName,
    username: u.username,
    lang: pickLang(u.languageCode),
  });

  const inviteLink = (id: number): string => {
    if (!botUsername) return '';
    return appShortName
      ? `https://t.me/${botUsername}/${appShortName}?startapp=ref_${id}`
      : `https://t.me/${botUsername}?start=ref_${id}`;
  };

  const lastSync = new Map<number, number>();
  const throttled = (id: number, now: number): boolean => {
    if (minSyncGap <= 0) return false;
    const prev = lastSync.get(id);
    if (prev !== undefined && now - prev < minSyncGap) return true;
    lastSync.set(id, now);
    if (lastSync.size > 10_000) {
      for (const [k, t] of lastSync) if (now - t > 60_000) lastSync.delete(k);
    }
    return false;
  };

  /** Pays out referral invites that arrived since the last save. */
  const payReferrals = (state: GameState, pending: number): number =>
    pending > 0 ? grantReferralBonus(state, pending) : 0;

  // ------------------------------------------------------------- errors ---

  app.setErrorHandler((err: FastifyError, req, reply) => {
    const status =
      typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    if (status >= 500) {
      req.log.error({ err }, 'request failed');
      return reply.code(status).send({ error: 'internal' });
    }
    const code = typeof err.code === 'string' && /^[a-z_]+$/.test(err.code) ? err.code : STATUS_CODES[status];
    return reply.code(status).send({ error: code ?? 'error' });
  });

  app.addHook('onResponse', (req, reply, done) => {
    const s = reply.statusCode;
    const level = s >= 500 ? 'error' : s >= 400 ? 'info' : 'debug';
    req.log[level](
      { method: req.method, url: req.url.split('?')[0], status: s, ms: Math.round(reply.elapsedTime) },
      'request',
    );
    done();
  });

  // ---------------------------------------------------------------- api ---

  app.get('/api/health', async () => ({ ok: true }));

  app.post('/api/session', async (req) => {
    const tg = requireUser(req);
    const body = asObject(req.body);
    const now = clock();
    const profile = toProfile(tg);
    const rec = db.getUser(tg.id, now);

    let state: GameState;
    let isNew = false;
    let offline: { earned: number; ms: number } | null = null;
    let referralBonus = 0;

    if (!rec) {
      state = newGame(now, randomUint32(), tg.firstName);
      let referrerId: number | null = null;
      const ref = parseRef(body.ref) ?? parseRef(tg.startParam);
      if (ref !== null && ref !== tg.id && db.exists(ref)) {
        referrerId = ref;
        state.cash += REF_JOIN_CASH;
        state.totalEarned += REF_JOIN_CASH;
      }
      db.createUser(profile, state, referrerId, now);
      isNew = true;
    } else {
      state = rec.state;
      const gap = now - state.lastTick;
      const cashBefore = state.cash;
      advance(state, now);
      if (gap > OFFLINE_REPORT_MS) offline = { earned: Math.max(0, state.cash - cashBefore), ms: gap };
      referralBonus = payReferrals(state, rec.pendingRefs);
      db.saveUser(profile, state, rec.pendingRefs, now);
    }

    return {
      user: { id: tg.id, firstName: profile.firstName, username: profile.username, lang: profile.lang },
      state,
      serverTime: now,
      offline,
      referralBonus,
      isNew,
      botUsername,
      inviteLink: inviteLink(tg.id),
    };
  });

  app.post('/api/sync', async (req) => {
    const tg = requireUser(req);
    const actions = asObject(req.body).actions;
    if (!Array.isArray(actions)) throw httpError(400, 'bad_actions');
    if (actions.length > MAX_SYNC_ACTIONS) throw httpError(400, 'too_many_actions');
    const now = clock();
    if (throttled(tg.id, now)) throw httpError(429, 'too_fast');

    const rec = db.getUser(tg.id, now);
    if (!rec) throw httpError(404, 'no_session');
    const state = rec.state;
    const referralBonus = payReferrals(state, rec.pendingRefs);

    const valid: Action[] = [];
    for (const a of actions) {
      const c = cleanAction(a);
      if (c) valid.push(c);
    }
    const r = replayActions(state, valid, now);
    db.saveUser(toProfile(tg), state, rec.pendingRefs, now);

    return {
      state,
      serverTime: now,
      applied: r.applied,
      rejected: r.rejected + (actions.length - valid.length),
      referralBonus,
    };
  });

  app.get('/api/leaderboard', async (req) => {
    const tg = requireUser(req);
    const scope = asObject(req.query).scope === 'friends' ? 'friends' : 'global';
    const mine = db.boardRow(tg.id);
    if (!mine) throw httpError(404, 'no_session');

    const present = (rows: Array<BoardRow & { rank: number }>) =>
      rows.map((r) => ({ rank: r.rank, name: r.name, netWorth: r.netWorth, era: r.era, me: r.id === tg.id }));

    if (scope === 'global') {
      return {
        top: present(withRanks(db.top(LEADERBOARD_SIZE))),
        me: { rank: db.rankOf(mine.netWorth), netWorth: mine.netWorth },
      };
    }

    const circle = new Map<number, BoardRow>([[mine.id, mine]]);
    for (const r of db.invited(tg.id, FRIENDS_LIMIT)) circle.set(r.id, r);
    const refId = db.referrerOf(tg.id);
    const referrer = refId !== null ? db.boardRow(refId) : null;
    if (referrer) circle.set(referrer.id, referrer);
    const ranked = withRanks([...circle.values()].sort((a, b) => b.netWorth - a.netWorth || a.id - b.id));
    const meRank = ranked.find((r) => r.id === tg.id)?.rank ?? ranked.length;
    return { top: present(ranked), me: { rank: meRank, netWorth: mine.netWorth } };
  });

  app.get('/api/friends', async (req) => {
    const tg = requireUser(req);
    return {
      count: db.invitedCount(tg.id),
      invited: db.invited(tg.id, LEADERBOARD_SIZE).map((r) => ({ name: r.name, netWorth: r.netWorth, era: r.era })),
      inviteLink: inviteLink(tg.id),
    };
  });

  // ------------------------------------------------------------- static ---

  const staticRoot = opts.staticDir ? resolve(opts.staticDir) : null;
  const hasStatic = staticRoot !== null && existsSync(join(staticRoot, 'index.html'));

  if (hasStatic) {
    app.register(fastifyStatic, {
      root: staticRoot,
      prefix: '/',
      cacheControl: false,
      setHeaders(reply, filePath) {
        const rel = relative(staticRoot, filePath).split(sep).join('/');
        if (rel.endsWith('.html')) reply.header('Cache-Control', 'no-cache');
        else if (rel.startsWith('assets/')) reply.header('Cache-Control', 'public, max-age=31536000, immutable');
        else reply.header('Cache-Control', 'public, max-age=3600');
      },
    });
  } else {
    app.log.info({ staticDir: staticRoot }, 'static client not found; serving API only');
  }

  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split('?')[0];
    const isApi = path === '/api' || path.startsWith('/api/');
    if (hasStatic && !isApi && !path.startsWith('/assets/') && (req.method === 'GET' || req.method === 'HEAD')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not_found' });
  });

  return app;
}
