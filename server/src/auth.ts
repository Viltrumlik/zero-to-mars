/**
 * Telegram Mini App authentication.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TgUser {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  languageCode: string;
  startParam: string;
}

/** Allowed clock skew for auth_date values from the future. */
const FUTURE_SKEW_SEC = 300;

const str = (v: unknown, max = 256): string => (typeof v === 'string' ? v.slice(0, max) : '');

/**
 * Validates raw `initData` (the query string from `Telegram.WebApp.initData`).
 * Pure: no env access, the clock is passed in. Returns null on any failure.
 */
export function validateInitData(
  initData: string,
  botToken: string,
  nowSec: number,
  maxAge: number,
): TgUser | null {
  if (!initData || !botToken || initData.length > 8192) return null;

  const params = new URLSearchParams(initData);
  const fields = new Map<string, string>();
  for (const [k, v] of params) {
    if (fields.has(k)) return null; // duplicate keys are never produced by Telegram
    fields.set(k, v);
  }

  const hash = fields.get('hash') ?? '';
  if (!/^[0-9a-f]{64}$/i.test(hash)) return null;
  fields.delete('hash');

  // Every remaining field (including `signature`) takes part in the check.
  const dataCheckString = [...fields.keys()]
    .sort()
    .map((k) => `${k}=${fields.get(k)}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secretKey).update(dataCheckString).digest();
  const given = Buffer.from(hash, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const authDate = Number(fields.get('auth_date'));
  if (!Number.isSafeInteger(authDate) || authDate <= 0) return null;
  if (maxAge > 0 && nowSec - authDate > maxAge) return null;
  if (authDate - nowSec > FUTURE_SKEW_SEC) return null;

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fields.get('user') ?? '');
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.id;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return null;

  return {
    id,
    firstName: str(raw.first_name, 64),
    lastName: str(raw.last_name, 64),
    username: str(raw.username, 64),
    languageCode: str(raw.language_code, 16),
    startParam: str(fields.get('start_param'), 128),
  };
}

/**
 * Dev-only auth: `Authorization: dev <id>:<name>`. Never enable in production.
 * Example: `dev 42:Alice`.
 */
export function parseDevAuth(value: string): TgUser | null {
  const m = /^(\d{1,15}):?(.*)$/s.exec(value.trim());
  if (!m) return null;
  const id = Number(m[1]);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const firstName = m[2].trim().slice(0, 64) || `Dev ${id}`;
  return { id, firstName, lastName: '', username: '', languageCode: 'en', startParam: '' };
}

export interface AuthConfig {
  botToken: string;
  devAuth: boolean;
  maxAgeSec: number;
}

/** Parses an `Authorization` header (`tma <initData>` or, in dev, `dev <id>:<name>`). */
export function authenticate(header: string | undefined, cfg: AuthConfig, nowMs: number): TgUser | null {
  if (!header) return null;
  const space = header.indexOf(' ');
  if (space < 0) return null;
  const scheme = header.slice(0, space).toLowerCase();
  const value = header.slice(space + 1).trim();
  if (scheme === 'tma') {
    return validateInitData(value, cfg.botToken, Math.floor(nowMs / 1000), cfg.maxAgeSec);
  }
  if (scheme === 'dev' && cfg.devAuth) return parseDevAuth(value);
  return null;
}
