/**
 * SQLite persistence (built-in node:sqlite, synchronous). One row per Telegram
 * user; the whole GameState is stored as JSON, with net_worth / era / name
 * denormalised for leaderboards.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { netWorth, normalizeState, sanitizeName } from '../../shared/src/engine.ts';
import type { GameState } from '../../shared/src/types.ts';

export interface UserRecord {
  id: number;
  firstName: string;
  username: string;
  lang: string;
  state: GameState;
  referrerId: number | null;
  pendingRefs: number;
  createdAt: number;
}

export interface BoardRow {
  id: number;
  name: string;
  netWorth: number;
  era: number;
}

export interface Profile {
  id: number;
  firstName: string;
  username: string;
  lang: string;
}

interface UserRow {
  id: number;
  first_name: string | null;
  username: string | null;
  lang: string | null;
  state: string;
  referrer_id: number | null;
  pending_refs: number;
  created_at: number;
}

interface BoardSqlRow {
  id: number;
  name: string | null;
  net_worth: number;
  era: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY,
  first_name   TEXT,
  username     TEXT,
  lang         TEXT,
  state        TEXT NOT NULL,
  net_worth    REAL NOT NULL DEFAULT 0,
  era          INTEGER NOT NULL DEFAULT 0,
  name         TEXT,
  referrer_id  INTEGER,
  pending_refs INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS users_net_worth ON users (net_worth DESC);
CREATE INDEX IF NOT EXISTS users_referrer ON users (referrer_id);
`;

/** Bumped when stored data needs a one-time fix (PRAGMA user_version). */
const DB_VERSION = 2;

/**
 * v2 (no tap income): every v1 save is reset to a fresh game when it is next
 * loaded (normalizeState). Zero their denormalised leaderboard columns now so
 * old tap fortunes of players who never come back don't top the v2 board.
 */
const MIGRATE_V2 = `
UPDATE users SET net_worth = 0, era = 0
WHERE (CASE WHEN json_valid(state) THEN json_extract(state, '$.v') END) IS NOT 2;
`;

const toBoard = (r: BoardSqlRow): BoardRow => ({
  id: r.id,
  name: r.name || 'Founder',
  netWorth: r.net_worth,
  era: r.era,
});

/** Net worth that is always safe to store in a NOT NULL REAL column. */
function safeNetWorth(s: GameState): number {
  const v = netWorth(s);
  if (!Number.isFinite(v)) throw new Error('refusing to save a non-finite net worth');
  return v;
}

export type Db = ReturnType<typeof openDb>;

/** Opens (and migrates) the database. Pass ':memory:' for tests. */
export function openDb(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(SCHEMA);
  const version = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  if (version < DB_VERSION) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(MIGRATE_V2);
      db.exec(`PRAGMA user_version = ${DB_VERSION}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  const q = {
    get: db.prepare(
      'SELECT id, first_name, username, lang, state, referrer_id, pending_refs, created_at FROM users WHERE id = ?',
    ),
    exists: db.prepare('SELECT 1 AS x FROM users WHERE id = ?'),
    insert: db.prepare(
      `INSERT INTO users (id, first_name, username, lang, state, net_worth, era, name, referrer_id, pending_refs, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    ),
    save: db.prepare(
      `UPDATE users SET first_name = ?, username = ?, lang = ?, state = ?, net_worth = ?, era = ?, name = ?,
         pending_refs = MAX(0, pending_refs - ?), updated_at = ?
       WHERE id = ?`,
    ),
    addRef: db.prepare('UPDATE users SET pending_refs = pending_refs + 1 WHERE id = ?'),
    top: db.prepare('SELECT id, name, net_worth, era FROM users ORDER BY net_worth DESC, id ASC LIMIT ?'),
    above: db.prepare('SELECT COUNT(*) AS n FROM users WHERE net_worth > ?'),
    board: db.prepare('SELECT id, name, net_worth, era FROM users WHERE id = ?'),
    invited: db.prepare(
      'SELECT id, name, net_worth, era FROM users WHERE referrer_id = ? ORDER BY net_worth DESC, id ASC LIMIT ?',
    ),
    invitedCount: db.prepare('SELECT COUNT(*) AS n FROM users WHERE referrer_id = ?'),
    referrer: db.prepare('SELECT referrer_id FROM users WHERE id = ?'),
  };

  function tx<R>(fn: () => R): R {
    db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  return {
    raw: db,
    tx,

    getUser(id: number, now: number): UserRecord | null {
      const r = q.get.get(id) as UserRow | undefined;
      if (!r) return null;
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(r.state);
      } catch {
        parsed = null; // corrupted save: normalizeState rebuilds a fresh game
      }
      // Corrupted and old v1 saves come back as a fresh v2 game; keep the player's name.
      const state = normalizeState(parsed, now);
      if ((parsed as { v?: unknown } | null)?.v !== 2) {
        const old = (parsed as { name?: unknown } | null)?.name;
        state.name = sanitizeName(typeof old === 'string' ? old : '') || sanitizeName(r.first_name ?? '') || state.name;
      }
      return {
        id: r.id,
        firstName: r.first_name ?? '',
        username: r.username ?? '',
        lang: r.lang ?? 'uz',
        state,
        referrerId: r.referrer_id,
        pendingRefs: r.pending_refs,
        createdAt: r.created_at,
      };
    },

    exists(id: number): boolean {
      return q.exists.get(id) !== undefined;
    },

    /** Inserts a new user; if `referrerId` is set, also credits the referrer one pending invite. */
    createUser(p: Profile, state: GameState, referrerId: number | null, now: number): void {
      tx(() => {
        q.insert.run(
          p.id,
          p.firstName,
          p.username,
          p.lang,
          JSON.stringify(state),
          safeNetWorth(state),
          state.era,
          state.name,
          referrerId,
          now,
          now,
        );
        if (referrerId !== null) q.addRef.run(referrerId);
      });
    },

    /** Saves state and consumes `refsConsumed` pending referral credits. */
    saveUser(p: Profile, state: GameState, refsConsumed: number, now: number): void {
      q.save.run(
        p.firstName,
        p.username,
        p.lang,
        JSON.stringify(state),
        safeNetWorth(state),
        state.era,
        state.name,
        refsConsumed,
        now,
        p.id,
      );
    },

    top(limit: number): BoardRow[] {
      return (q.top.all(limit) as unknown as BoardSqlRow[]).map(toBoard);
    },

    /** Competition rank: 1 + number of players strictly richer. */
    rankOf(nw: number): number {
      return 1 + Number((q.above.get(nw) as { n: number }).n);
    },

    boardRow(id: number): BoardRow | null {
      const r = q.board.get(id) as BoardSqlRow | undefined;
      return r ? toBoard(r) : null;
    },

    invited(id: number, limit: number): BoardRow[] {
      return (q.invited.all(id, limit) as unknown as BoardSqlRow[]).map(toBoard);
    },

    referrerOf(id: number): number | null {
      const r = q.referrer.get(id) as { referrer_id: number | null } | undefined;
      return r?.referrer_id ?? null;
    },

    invitedCount(id: number): number {
      return Number((q.invitedCount.get(id) as { n: number }).n);
    },

    close(): void {
      if (db.isOpen) db.close();
    },
  };
}
