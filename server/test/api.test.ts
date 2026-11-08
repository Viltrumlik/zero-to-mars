import { createHmac } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIN_JOB_MS, grantReferralBonus, incomePerHour, newGame } from '../../shared/src/engine.ts';
import type { GameState } from '../../shared/src/types.ts';
import { buildApp, MAX_SYNC_ACTIONS, REF_JOIN_CASH } from '../src/app.ts';
import type { AppOptions } from '../src/app.ts';
import { openDb } from '../src/db.ts';
import type { Db } from '../src/db.ts';

const TOKEN = '123456789:TEST-fake-bot-token';
const BOT = 'zero_mars_bot';
/** Fake game clock start (auth always uses the real clock). */
const T0 = Date.UTC(2026, 10, 8, 12, 0, 0);
/** Real time a paper route needs (route mini-game minimum + 1 s). */
const ROUTE_MS = MIN_JOB_MS.route + 1000;

let db: Db;
let app: FastifyInstance | null = null;
/** Game clock of the current app; tests move it forward. */
let now = T0;

async function make(over: Partial<AppOptions> = {}): Promise<FastifyInstance> {
  app = buildApp({ db, botToken: TOKEN, botUsername: BOT, devAuth: true, syncMinIntervalMs: 0, ...over });
  await app.ready();
  return app;
}

/** App whose game clock is the mutable `now`. */
const makeClocked = (over: Partial<AppOptions> = {}) => make({ now: () => now, ...over });

beforeEach(() => {
  db = openDb(':memory:');
  now = T0;
});

afterEach(async () => {
  await app?.close();
  app = null;
  db.close();
});

const NAMES: Record<number, string> = {};
const dev = (id: number) => ({ authorization: `dev ${id}:${NAMES[id] ?? `User${id}`}` });

function tma(fields: Record<string, string>): { authorization: string } {
  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const dcs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  return { authorization: `tma ${new URLSearchParams({ ...fields, hash })}` };
}

async function session(id: number, name: string, body: Record<string, unknown> = {}) {
  NAMES[id] = name;
  const r = await app!.inject({ method: 'POST', url: '/api/session', headers: dev(id), payload: body });
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
}

function sync(id: number, actions: unknown) {
  return app!.inject({ method: 'POST', url: '/api/sync', headers: dev(id), payload: { actions } });
}

async function syncOk(id: number, actions: unknown[]) {
  const r = await sync(id, actions);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
}

async function getJson(id: number, url: string) {
  const r = await app!.inject({ method: 'GET', url, headers: dev(id) });
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
}

/** Edits a stored save directly (e.g. to seed net worth or jump eras). */
function editSave(id: number, fn: (s: GameState) => void): void {
  const rec = db.getUser(id, now)!;
  fn(rec.state);
  db.saveUser({ id, firstName: rec.firstName, username: rec.username, lang: rec.lang }, rec.state, 0, now);
}

/** Does one paper route through the API: start, let the real clock pass, finish. Needs makeClocked(). */
async function paperRoute(id: number, score = 1) {
  const start = await syncOk(id, [{ t: 'jobStart', id: 'newspaper', at: now }]);
  expect(start.applied).toBe(1);
  now += ROUTE_MS;
  const end = await syncOk(id, [{ t: 'jobEnd', id: 'newspaper', score, at: now }]);
  expect(end.applied).toBe(1);
  return end;
}

describe('basics', () => {
  it('health needs no auth', async () => {
    await make();
    const r = await app!.inject({ method: 'GET', url: '/api/health' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true });
  });

  it('rejects requests without valid auth', async () => {
    await make();
    for (const headers of [{}, { authorization: 'tma garbage' }, { authorization: 'Bearer x' }]) {
      const r = await app!.inject({ method: 'POST', url: '/api/session', headers, payload: {} });
      expect(r.statusCode).toBe(401);
      expect(r.json()).toEqual({ error: 'unauthorized' });
    }
    // dev auth is refused when disabled
    await app!.close();
    await make({ devAuth: false });
    const r = await app!.inject({ method: 'POST', url: '/api/session', headers: dev(1), payload: {} });
    expect(r.statusCode).toBe(401);
  });

  it('accepts real Telegram initData', async () => {
    await make();
    const headers = tma({
      user: JSON.stringify({ id: 555, first_name: 'Dilnoza', language_code: 'ru' }),
      auth_date: String(Math.floor(Date.now() / 1000)),
    });
    const r = await app!.inject({ method: 'POST', url: '/api/session', headers, payload: {} });
    expect(r.statusCode).toBe(200);
    expect(r.json().user).toEqual({ id: 555, firstName: 'Dilnoza', username: '', lang: 'ru' });
  });

  it('returns 413 for oversized bodies and 404 JSON for unknown api routes', async () => {
    await make();
    const r = await app!.inject({
      method: 'POST',
      url: '/api/sync',
      headers: { ...dev(1), 'content-type': 'application/json' },
      payload: JSON.stringify({ actions: [], pad: 'x'.repeat(300_000) }),
    });
    expect(r.statusCode).toBe(413);
    expect(r.json()).toEqual({ error: 'payload_too_large' });
    const nf = await app!.inject({ method: 'GET', url: '/api/nope' });
    expect(nf.statusCode).toBe(404);
    expect(nf.json()).toEqual({ error: 'not_found' });
  });
});

describe('session', () => {
  it('creates a new game, then loads it', async () => {
    await make();
    const s1 = await session(1001, 'Alice');
    expect(s1.isNew).toBe(true);
    expect(s1.user).toEqual({ id: 1001, firstName: 'Alice', username: '', lang: 'en' });
    expect(s1.state.v).toBe(2);
    expect(s1.state.name).toBe('Alice');
    expect(s1.state.cash).toBe(0);
    expect(s1.state.era).toBe(0);
    expect(s1.offline).toBeNull();
    expect(s1.referralBonus).toBe(0);
    expect(s1.botUsername).toBe(BOT);
    expect(s1.inviteLink).toBe(`https://t.me/${BOT}?start=ref_1001`);
    expect(typeof s1.serverTime).toBe('number');

    const s2 = await session(1001, 'Alice');
    expect(s2.isNew).toBe(false);
    expect(s2.state.createdAt).toBe(s1.state.createdAt);
  });

  it('uses the direct Mini App link when APP_SHORT_NAME is set', async () => {
    await make({ appShortName: 'play' });
    const s = await session(7, 'G');
    expect(s.inviteLink).toBe(`https://t.me/${BOT}/play?startapp=ref_7`);
  });

  it('reports offline business income after a long gap', async () => {
    await makeClocked();
    await session(1, 'Offline');
    // Businesses unlock in the startup era: jump the save there with seed money.
    editSave(1, (s) => {
      s.era = 2;
      s.cash = 5_000;
    });
    const r = await syncOk(1, [{ t: 'invest', id: 'citymap', at: now }]);
    expect(r.applied).toBe(1);
    expect(r.state.biz.citymap).toBe(1);

    const perHour = incomePerHour(r.state);
    expect(perHour).toBeGreaterThan(0);

    now += 30_000; // short gap: not reported
    expect((await session(1, 'Offline')).offline).toBeNull();

    now += 2 * 3600_000;
    const s = await session(1, 'Offline');
    expect(s.offline.ms).toBe(2 * 3600_000);
    expect(s.offline.earned).toBeCloseTo(perHour * 2, 6);
    expect(s.state.cash).toBeCloseTo(r.state.cash + perHour / 120 + perHour * 2, 6); // + 30 s accrued earlier
  });
});

describe('old v1 saves', () => {
  /** Shape of a v1 (tap-era) save: huge tap fortune, v1-only fields. */
  const V1 = { v: 1, name: 'OldNick', cash: 1e9, taps: 123_456, biz: { repair: 40 }, era: 4, lastTick: 1, createdAt: 1 };
  const putRaw = (id: number, state: unknown, netWorth = 1e9) =>
    db.raw.prepare('UPDATE users SET state = ?, net_worth = ?, era = ? WHERE id = ?').run(JSON.stringify(state), netWorth, 4, id);

  it('session resets a stored v1 state to a fresh v2 game and keeps the name', async () => {
    await makeClocked();
    await session(1, 'Veteran');
    putRaw(1, V1);
    const s = await session(1, 'Veteran');
    expect(s.isNew).toBe(false);
    expect(s.state.v).toBe(2);
    expect(s.state.cash).toBe(0);
    expect(s.state.era).toBe(0);
    expect(s.state.biz).toEqual({});
    expect(s.state).not.toHaveProperty('taps');
    expect(s.state.name).toBe('OldNick');
    expect(s.state.lastTick).toBe(now);
    // the leaderboard row is rewritten from the reset save
    const lb = await getJson(1, '/api/leaderboard');
    expect(lb.me.netWorth).toBe(0);
    expect(lb.top[0]).toMatchObject({ name: 'OldNick', era: 0 });
  });

  it('sync loads through the same reset (and v1 tap actions are refused)', async () => {
    await makeClocked();
    await session(1, 'Veteran');
    putRaw(1, V1);
    const r = await syncOk(1, [{ t: 'tap', n: 1000, at: now }]);
    expect(r.applied).toBe(0);
    expect(r.rejected).toBe(1);
    expect(r.state.v).toBe(2);
    expect(r.state.cash).toBe(0);
    expect(r.state.era).toBe(0);
  });

  it('a corrupted save is rebuilt with the Telegram name', async () => {
    await makeClocked();
    await session(1, 'Broken');
    db.raw.prepare('UPDATE users SET state = ? WHERE id = ?').run('{not json', 1);
    const s = await session(1, 'Broken');
    expect(s.state.v).toBe(2);
    expect(s.state.name).toBe('Broken');
  });

  it('opening the db drops stale v1 net worths from the leaderboard once', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mars-db-'));
    try {
      const path = join(dir, 'game.db');
      let d = openDb(path);
      const fresh = newGame(T0, 1, 'Fresh');
      fresh.cash = 50;
      d.createUser({ id: 1, firstName: 'Fresh', username: '', lang: 'en' }, fresh, null, T0);
      d.createUser({ id: 2, firstName: 'Veteran', username: '', lang: 'en' }, newGame(T0, 2, 'OldNick'), null, T0);
      d.createUser({ id: 3, firstName: 'Junk', username: '', lang: 'en' }, newGame(T0, 3, 'Junk'), null, T0);
      // simulate a database written by the v1 server
      d.raw.prepare('UPDATE users SET state = ?, net_worth = 1e9, era = 4 WHERE id = 2').run(JSON.stringify(V1));
      d.raw.prepare("UPDATE users SET state = '{oops', net_worth = 5e8, era = 3 WHERE id = 3").run();
      d.raw.exec('PRAGMA user_version = 0');
      d.close();

      d = openDb(path);
      expect(d.top(10).map((r) => [r.id, r.netWorth, r.era])).toEqual([
        [1, 50, 0],
        [2, 0, 0],
        [3, 0, 0],
      ]);
      // the migration runs once: later values survive the next open
      d.raw.prepare('UPDATE users SET net_worth = 7 WHERE id = 2').run();
      d.close();
      d = openDb(path);
      expect(d.boardRow(2)?.netWorth).toBe(7);
      d.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('sync', () => {
  it('a real job pays cash; there is no tap income', async () => {
    await makeClocked();
    await session(1, 'Worker');
    const r1 = await syncOk(1, [
      { t: 'tap', n: 10, at: now },
      { t: 'visit', b: 'home', at: now },
      { t: 'jobStart', id: 'newspaper', at: now },
    ]);
    expect(r1.applied).toBe(2);
    expect(r1.rejected).toBe(1);
    expect(r1.state.cash).toBe(0);
    expect(r1.state.job).toEqual({ id: 'newspaper', startedAt: T0 });
    expect(r1.referralBonus).toBe(0);
    expect(r1.serverTime).toBe(T0);

    now += ROUTE_MS;
    const r2 = await syncOk(1, [{ t: 'jobEnd', id: 'newspaper', score: 1, at: now }]);
    expect(r2.applied).toBe(1);
    expect(r2.rejected).toBe(0);
    expect(r2.state.cash).toBeGreaterThan(0);
    expect(r2.state.totalEarned).toBe(r2.state.cash);
    expect(r2.state.jobCounts.newspaper).toBe(1);
    expect(r2.state.job).toBeNull();
    expect(r2.state.minute).toBeGreaterThan(r1.state.minute); // the shift took game time
  });

  it('works within one sync once the real time has passed', async () => {
    await makeClocked();
    await session(1, 'Batch');
    now += ROUTE_MS;
    const r = await syncOk(1, [
      { t: 'jobStart', id: 'newspaper', at: T0 },
      { t: 'jobEnd', id: 'newspaper', score: 1, at: T0 + ROUTE_MS },
    ]);
    expect(r.applied).toBe(2);
    expect(r.state.cash).toBeGreaterThan(0);
    expect(r.state.jobCounts.newspaper).toBe(1);
  });

  it('a client cannot fake the job duration with future timestamps', async () => {
    await makeClocked();
    await session(1, 'Cheater');
    const r = await syncOk(1, [
      { t: 'jobStart', id: 'newspaper', at: now - 999_999 },
      { t: 'jobEnd', id: 'newspaper', score: 1, at: now + 999_999 },
    ]);
    expect(r.applied).toBe(1);
    expect(r.rejected).toBe(1);
    expect(r.state.cash).toBe(0);
    expect(r.state.jobCounts).toEqual({});
  });

  it('rejects buying without cash', async () => {
    await make();
    await session(1, 'Broke');
    // a new game starts at 07:00; the electronics store opens at 09:00
    const r = await syncOk(1, [
      { t: 'rest', at: Date.now() },
      { t: 'buy', id: 'computer', at: Date.now() },
    ]);
    expect(r.applied).toBe(1);
    expect(r.rejected).toBe(1);
    expect(r.state.minute).toBe(9 * 60);
    expect(r.state.items).toEqual([]);
    expect(r.state.cash).toBe(0);
  });

  it('rejects malformed actions without corrupting the save', async () => {
    await make();
    await session(1, 'Hacker');
    const t = Date.now();
    const bad: unknown[] = [
      // dropped by the shape check
      null,
      42,
      'visit',
      [{ t: 'visit', b: 'home' }],
      { t: 'jobEnd', id: 'newspaper', score: 'perfect', at: t },
      { t: 'jobEnd', id: 'newspaper', at: t },
      { t: 'jobStart', at: t },
      { t: 'jobStart', id: '', at: t },
      { t: 'study', id: 'x'.repeat(65), at: t },
      { t: 'buy', id: { evil: true }, at: t },
      { t: 'invest', id: ['citymap'], at: t },
      { t: 'visit', at: t },
      { t: 'visit', b: 7, at: t },
      { t: 'visit', b: 'x'.repeat(33), at: t },
      { t: 'choose', id: 'x', c: 'length', at: t },
      { t: 'choose', id: 'x', c: 1.5, at: t },
      { t: 'choose', id: 'x', c: 32, at: t },
      { t: 'name', name: 'x'.repeat(257), at: t },
      { t: 'name', name: 5, at: t },
      { t: 'teleport', at: t },
      { t: 'tap', n: 5, at: t },
      { t: 'skill', id: 'code', at: t },
      { t: 'advance', at: t },
      // well-formed, refused by the engine (prototype keys are not content ids)
      { t: 'buy', id: '__proto__', at: t },
      { t: 'jobStart', id: 'constructor', at: t },
      { t: 'study', id: 'toString', at: t },
      { t: 'invest', id: 'hasOwnProperty', at: t },
      { t: 'visit', b: '__proto__', at: t },
      { t: 'choose', id: '__proto__', c: 0, at: t },
      { t: 'quest', at: t },
    ];
    const r = await syncOk(1, [...bad, { t: 'visit', b: 'home', at: t }]);
    expect(r.applied).toBe(1);
    expect(r.rejected).toBe(bad.length);
    expect(r.state.cash).toBe(0);
    expect(r.state.flags).toEqual({ 'v:home': 1 });
    expect(r.state.items).toEqual([]);
    expect(r.state.biz).toEqual({});
    expect(r.state.job).toBeNull();
  });

  it('validates the payload', async () => {
    await make();
    await session(1, 'V');
    expect((await sync(1, undefined)).statusCode).toBe(400);
    expect((await sync(1, 'nope')).statusCode).toBe(400);
    const tooMany = Array.from({ length: MAX_SYNC_ACTIONS + 1 }, () => ({ t: 'rest', at: 0 }));
    const r = await sync(1, tooMany);
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({ error: 'too_many_actions' });
    expect((await sync(1, Array.from({ length: MAX_SYNC_ACTIONS }, () => ({ t: 'rest', at: 0 })))).statusCode).toBe(200);
  });

  it('needs a session first', async () => {
    await make();
    const r = await sync(99, []);
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ error: 'no_session' });
  });

  it('throttles syncs closer than 250 ms', async () => {
    await make({ syncMinIntervalMs: undefined });
    await session(1, 'Fast');
    expect((await sync(1, [])).statusCode).toBe(200);
    const r = await sync(1, []);
    expect(r.statusCode).toBe(429);
    expect(r.json()).toEqual({ error: 'too_fast' });
    // other users are unaffected
    await session(2, 'Other');
    expect((await sync(2, [])).statusCode).toBe(200);
  });
});

describe('leaderboard', () => {
  it('orders by net worth and ranks me', async () => {
    await makeClocked();
    await session(1, 'Small');
    await session(2, 'Big');
    await session(3, 'Mid');
    editSave(1, (s) => (s.cash = 10));
    editSave(2, (s) => (s.cash = 150));
    editSave(3, (s) => (s.cash = 50));

    const lb = await getJson(1, '/api/leaderboard?scope=global');
    expect(lb.top.map((r: { name: string }) => r.name)).toEqual(['Big', 'Mid', 'Small']);
    expect(lb.top.map((r: { rank: number }) => r.rank)).toEqual([1, 2, 3]);
    expect(lb.top.map((r: { me: boolean }) => r.me)).toEqual([false, false, true]);
    expect(lb.me.rank).toBe(3);
    expect(lb.me.netWorth).toBe(10);
    expect(Object.keys(lb.top[0]).sort()).toEqual(['era', 'me', 'name', 'netWorth', 'rank']);

    const lb2 = await getJson(2, '/api/leaderboard');
    expect(lb2.me.rank).toBe(1);
    expect(lb2.top[0].me).toBe(true);
  });

  it('ranks players by money earned from jobs', async () => {
    await makeClocked();
    await session(1, 'Lazy');
    await session(2, 'Hard');
    await paperRoute(2, 1);
    const lb = await getJson(1, '/api/leaderboard');
    expect(lb.top.map((r: { name: string }) => r.name)).toEqual(['Hard', 'Lazy']);
    expect(lb.top[0].netWorth).toBeGreaterThan(0);
    expect(lb.me.rank).toBe(2);
  });

  it('gives tied players the same rank', async () => {
    await makeClocked();
    await session(1, 'A');
    await session(2, 'B');
    await session(3, 'C');
    editSave(3, (s) => (s.cash = 5));
    const lb = await getJson(1, '/api/leaderboard');
    expect(lb.top.map((r: { rank: number }) => r.rank)).toEqual([1, 2, 2]);
    expect(lb.me.rank).toBe(2);
  });

  it('never exposes telegram ids or usernames', async () => {
    await make();
    const headers = tma({
      user: JSON.stringify({ id: 987654321, first_name: 'Secret', username: 'secret_handle' }),
      auth_date: String(Math.floor(Date.now() / 1000)),
    });
    const s = await app!.inject({ method: 'POST', url: '/api/session', headers, payload: {} });
    expect(s.statusCode).toBe(200);
    for (const scope of ['global', 'friends']) {
      const r = await app!.inject({ method: 'GET', url: `/api/leaderboard?scope=${scope}`, headers });
      expect(r.statusCode).toBe(200);
      expect(r.body).not.toContain('987654321');
      expect(r.body).not.toContain('secret_handle');
    }
  });

  it('requires a session', async () => {
    await make();
    const r = await app!.inject({ method: 'GET', url: '/api/leaderboard', headers: dev(5) });
    expect(r.statusCode).toBe(404);
  });
});

describe('referrals', () => {
  /** What one invite pays the referrer in childhood (era 0). */
  const inviteBonus = (n: number) => grantReferralBonus(newGame(T0, 1), n);

  it('B joins with A ref: B gets cash, A gets a bonus once, friends list shows B', async () => {
    await makeClocked();
    const a0 = await session(1001, 'Alice');
    expect(a0.state.cash).toBe(0);

    const b = await session(2002, 'Bob', { ref: 'ref_1001' });
    expect(b.isNew).toBe(true);
    expect(b.state.cash).toBe(REF_JOIN_CASH);
    expect(b.state.totalEarned).toBe(REF_JOIN_CASH);

    const a1 = await session(1001, 'Alice');
    expect(a1.referralBonus).toBe(inviteBonus(1));
    expect(a1.state.cash).toBe(a1.referralBonus);

    const a2 = await session(1001, 'Alice');
    expect(a2.referralBonus).toBe(0);

    const friends = await getJson(1001, '/api/friends');
    expect(friends.count).toBe(1);
    expect(friends.invited).toEqual([{ name: 'Bob', netWorth: REF_JOIN_CASH, era: 0 }]);
    expect(friends.inviteLink).toBe(`https://t.me/${BOT}?start=ref_1001`);

    // Alice also does a paper route, so she is ahead of Bob
    await paperRoute(1001, 1);

    // friends leaderboard: A + invited B (+ referrer for B), strangers excluded
    await session(3003, 'Stranger');
    const lbA = await getJson(1001, '/api/leaderboard?scope=friends');
    expect(lbA.top.map((r: { name: string }) => r.name).sort()).toEqual(['Alice', 'Bob']);
    expect(lbA.top[0].name).toBe('Alice');
    expect(lbA.top[0].netWorth).toBeGreaterThan(REF_JOIN_CASH);
    expect(lbA.me.rank).toBe(1);
    const lbB = await getJson(2002, '/api/leaderboard?scope=friends');
    expect(lbB.top.map((r: { name: string }) => r.name)).toEqual(['Alice', 'Bob']);
    expect(lbB.me.rank).toBe(2);
  });

  it('pays pending referral bonuses on sync too', async () => {
    await make();
    await session(1, 'A');
    await session(2, 'B', { ref: 1 });
    await session(3, 'C', { ref: '1' });
    const r = await syncOk(1, []);
    expect(r.referralBonus).toBe(inviteBonus(2));
    expect(r.state.cash).toBe(inviteBonus(2));
    expect((await syncOk(1, [])).referralBonus).toBe(0);
    expect((await getJson(1, '/api/friends')).count).toBe(2);
  });

  it('ignores self, unknown and late refs', async () => {
    await make();
    const self = await session(10, 'Self', { ref: 'ref_10' });
    expect(self.state.cash).toBe(0);
    const unknown = await session(11, 'Unknown', { ref: 'ref_424242' });
    expect(unknown.state.cash).toBe(0);
    const late = await session(10, 'Self', { ref: 'ref_11' }); // existing user
    expect(late.state.cash).toBe(0);
    const junk = await session(12, 'Junk', { ref: 'ref_abc' });
    expect(junk.state.cash).toBe(0);
    expect((await getJson(11, '/api/friends')).count).toBe(0);
    expect((await session(11, 'Unknown')).referralBonus).toBe(0);
  });

  it('reads the ref from initData start_param', async () => {
    await make();
    await session(1001, 'Alice');
    const headers = tma({
      user: JSON.stringify({ id: 4004, first_name: 'Sardor' }),
      auth_date: String(Math.floor(Date.now() / 1000)),
      start_param: 'ref_1001',
    });
    const r = await app!.inject({ method: 'POST', url: '/api/session', headers, payload: {} });
    expect(r.statusCode).toBe(200);
    expect(r.json().state.cash).toBe(REF_JOIN_CASH);
    expect((await getJson(1001, '/api/friends')).count).toBe(1);
  });
});

describe('static client', () => {
  let dir = '';
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mars-static-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Mars</title>');
    writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('serves files with cache headers and falls back to index.html', async () => {
    await make({ staticDir: dir });
    const root = await app!.inject({ method: 'GET', url: '/' });
    expect(root.statusCode).toBe(200);
    expect(root.body).toContain('<title>Mars</title>');
    expect(root.headers['cache-control']).toBe('no-cache');

    const asset = await app!.inject({ method: 'GET', url: '/assets/app-abc123.js' });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');

    const spa = await app!.inject({ method: 'GET', url: '/play/leaderboard?x=1' });
    expect(spa.statusCode).toBe(200);
    expect(spa.body).toContain('<title>Mars</title>');
    expect(spa.headers['cache-control']).toBe('no-cache');

    expect((await app!.inject({ method: 'GET', url: '/assets/missing.js' })).statusCode).toBe(404);
    const api = await app!.inject({ method: 'GET', url: '/api/missing' });
    expect(api.statusCode).toBe(404);
    expect(api.json()).toEqual({ error: 'not_found' });
    expect((await app!.inject({ method: 'GET', url: '/api/health' })).json()).toEqual({ ok: true });
  });
});
