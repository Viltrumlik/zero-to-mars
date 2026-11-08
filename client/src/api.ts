import type { Action, GameState } from '../../shared/src/types.ts';
import { initData, inTelegram, telegramUser } from './telegram.ts';

export interface SessionResponse {
  user: { id: number; firstName: string; username?: string; lang?: string };
  state: GameState;
  serverTime: number;
  offline: { earned: number; ms: number } | null;
  referralBonus: number;
  isNew: boolean;
  botUsername?: string;
  inviteLink?: string;
}

export interface SyncResponse {
  state: GameState;
  serverTime: number;
  applied: number;
  rejected: number;
  referralBonus: number;
}

export interface LeaderRow {
  rank: number;
  name: string;
  netWorth: number;
  era: number;
  me: boolean;
}

export interface LeaderboardResponse {
  top: LeaderRow[];
  me: { rank: number; netWorth: number };
}

export interface FriendsResponse {
  count: number;
  invited: { name: string; netWorth: number; era: number }[];
  inviteLink: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

const DEV_ID_KEY = 'ztm_dev_id';

function authHeader(): string {
  if (inTelegram) return `tma ${initData()}`;
  let id = '';
  try {
    id = localStorage.getItem(DEV_ID_KEY) ?? '';
    if (!id) {
      id = String(9_000_000_000 + Math.floor(Math.random() * 1_000_000_000));
      localStorage.setItem(DEV_ID_KEY, id);
    }
  } catch {
    id = '9000000001';
  }
  return `dev ${id}:${telegramUser()?.first_name ?? 'Player'}`;
}

async function req<T>(method: 'GET' | 'POST', path: string, body?: unknown, keepalive = false): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json', authorization: authHeader() },
      body: body === undefined ? undefined : JSON.stringify(body),
      keepalive,
      signal: keepalive ? undefined : ctrl.signal,
    });
    if (!res.ok) throw new ApiError(res.status);
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) throw new ApiError(0);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  session: (ref?: string) => req<SessionResponse>('POST', '/api/session', { ref }),
  sync: (actions: Action[], keepalive = false) => req<SyncResponse>('POST', '/api/sync', { actions }, keepalive),
  leaderboard: (scope: 'global' | 'friends') => req<LeaderboardResponse>('GET', `/api/leaderboard?scope=${scope}`),
  friends: () => req<FriendsResponse>('GET', '/api/friends'),
};
