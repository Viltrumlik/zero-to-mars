import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { authenticate, parseDevAuth, validateInitData } from '../src/auth.ts';

const TOKEN = '123456789:TEST-fake-bot-token';
const NOW = 1_800_000_000;
const DAY = 86_400;

/** Builds initData exactly the way Telegram signs it. */
function sign(fields: Record<string, string>, token = TOKEN): string {
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const dcs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const user = { id: 777001, first_name: 'Ali', last_name: 'Valiyev', username: 'ali_v', language_code: 'uz' };
const baseFields = (over: Record<string, string> = {}) => ({
  query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
  user: JSON.stringify(user),
  auth_date: String(NOW - 60),
  signature: 'sig-ed25519-third-party',
  start_param: 'ref_42',
  ...over,
});

describe('validateInitData', () => {
  it('accepts correctly signed initData (signature field included in the check)', () => {
    const u = validateInitData(sign(baseFields()), TOKEN, NOW, DAY);
    expect(u).toEqual({
      id: 777001,
      firstName: 'Ali',
      lastName: 'Valiyev',
      username: 'ali_v',
      languageCode: 'uz',
      startParam: 'ref_42',
    });
  });

  it('rejects a tampered field', () => {
    const data = sign(baseFields());
    const tampered = data.replace(encodeURIComponent('"id":777001'), encodeURIComponent('"id":777002'));
    expect(tampered).not.toBe(data);
    expect(validateInitData(tampered, TOKEN, NOW, DAY)).toBeNull();

    const p = new URLSearchParams(data);
    p.set('start_param', 'ref_1');
    expect(validateInitData(p.toString(), TOKEN, NOW, DAY)).toBeNull();
  });

  it('rejects data signed with another token', () => {
    expect(validateInitData(sign(baseFields(), '999:OTHER'), TOKEN, NOW, DAY)).toBeNull();
  });

  it('rejects an expired auth_date', () => {
    const data = sign(baseFields({ auth_date: String(NOW - DAY - 1) }));
    expect(validateInitData(data, TOKEN, NOW, DAY)).toBeNull();
    // still fine just inside the window
    expect(validateInitData(sign(baseFields({ auth_date: String(NOW - DAY + 5) })), TOKEN, NOW, DAY)).not.toBeNull();
  });

  it('rejects auth_date far in the future, missing hash and garbage', () => {
    expect(validateInitData(sign(baseFields({ auth_date: String(NOW + 3600) })), TOKEN, NOW, DAY)).toBeNull();
    const noHash = new URLSearchParams(sign(baseFields()));
    noHash.delete('hash');
    expect(validateInitData(noHash.toString(), TOKEN, NOW, DAY)).toBeNull();
    expect(validateInitData('', TOKEN, NOW, DAY)).toBeNull();
    expect(validateInitData('hash=zz&user=1', TOKEN, NOW, DAY)).toBeNull();
    expect(validateInitData(sign(baseFields()), '', NOW, DAY)).toBeNull();
  });

  it('rejects a signed payload without a valid user id', () => {
    expect(validateInitData(sign(baseFields({ user: '{"id":"x"}' })), TOKEN, NOW, DAY)).toBeNull();
    expect(validateInitData(sign(baseFields({ user: 'not json' })), TOKEN, NOW, DAY)).toBeNull();
  });
});

describe('authenticate header', () => {
  const cfg = { botToken: TOKEN, devAuth: false, maxAgeSec: DAY };

  it('handles tma scheme', () => {
    expect(authenticate(`tma ${sign(baseFields())}`, cfg, NOW * 1000)?.id).toBe(777001);
    expect(authenticate(undefined, cfg, NOW * 1000)).toBeNull();
    expect(authenticate('Bearer abc', cfg, NOW * 1000)).toBeNull();
  });

  it('accepts dev scheme only when enabled', () => {
    expect(authenticate('dev 5:Bob', cfg, NOW * 1000)).toBeNull();
    expect(authenticate('dev 5:Bob', { ...cfg, devAuth: true }, NOW * 1000)?.firstName).toBe('Bob');
    expect(parseDevAuth('0:x')).toBeNull();
    expect(parseDevAuth('abc')).toBeNull();
    expect(parseDevAuth('12')?.id).toBe(12);
  });
});
