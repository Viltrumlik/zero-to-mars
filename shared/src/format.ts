import type { Lang } from './types.ts';

const SUFFIX: Record<Lang, string[]> = {
  uz: ['', ' ming', ' mln', ' mlrd', ' trln', ' kvdr'],
  ru: ['', ' тыс', ' млн', ' млрд', ' трлн', ' квдр'],
  en: ['', 'K', 'M', 'B', 'T', 'Qa'],
};

/** Compact money: $1.25 mln / $1.25M. */
export function money(v: number, lang: Lang = 'en'): string {
  const sign = v < 0 ? '-' : '';
  let n = Math.abs(v);
  if (!Number.isFinite(n)) return '$∞';
  if (n < 1000) return `${sign}$${n < 10 ? n.toFixed(n % 1 === 0 ? 0 : 2) : Math.floor(n)}`;
  let i = 0;
  while (n >= 1000 && i < SUFFIX[lang].length - 1) {
    n /= 1000;
    i++;
  }
  const digits = n >= 100 ? 0 : n >= 10 ? 1 : 2;
  return `${sign}$${n.toFixed(digits)}${SUFFIX[lang][i]}`;
}

export function num(v: number, lang: Lang = 'en'): string {
  return money(v, lang).replace('$', '');
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `${r}s`;
}
