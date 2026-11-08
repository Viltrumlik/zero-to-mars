/** Thin, typed wrapper around window.Telegram.WebApp that degrades gracefully in a normal browser. */

interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TgWebApp {
  initData: string;
  initDataUnsafe: { user?: TgUser; start_param?: string };
  version: string;
  platform: string;
  ready(): void;
  expand(): void;
  isVersionAtLeast(v: string): boolean;
  disableVerticalSwipes?: () => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  setBottomBarColor?: (c: string) => void;
  openTelegramLink(url: string): void;
  openLink(url: string): void;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
}

const tg: TgWebApp | null = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp ?? null;

export const inTelegram = !!tg && typeof tg.initData === 'string' && tg.initData.length > 0;

export function initTelegram(): void {
  if (!tg || !inTelegram) return;
  try {
    tg.ready();
    tg.expand();
    if (tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes?.();
    if (tg.isVersionAtLeast('6.1')) {
      tg.setHeaderColor?.('#0b0e1a');
      tg.setBackgroundColor?.('#0b0e1a');
    }
    if (tg.isVersionAtLeast('7.10')) tg.setBottomBarColor?.('#0b0e1a');
  } catch {
    /* older clients: ignore */
  }
}

export function initData(): string {
  return inTelegram ? tg!.initData : '';
}

export function telegramUser(): TgUser | undefined {
  return inTelegram ? tg!.initDataUnsafe.user : undefined;
}

export function startParam(): string | undefined {
  const fromTg = inTelegram ? tg!.initDataUnsafe.start_param : undefined;
  const qs = new URLSearchParams(location.search);
  return fromTg ?? qs.get('ref') ?? qs.get('tgWebAppStartParam') ?? undefined;
}

type Haptic = 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning' | 'select';

export function haptic(kind: Haptic): void {
  const h = inTelegram && tg!.isVersionAtLeast('6.1') ? tg!.HapticFeedback : undefined;
  try {
    if (h) {
      if (kind === 'select') h.selectionChanged();
      else if (kind === 'success' || kind === 'error' || kind === 'warning') h.notificationOccurred(kind);
      else h.impactOccurred(kind);
    } else if ('vibrate' in navigator && kind !== 'select') {
      navigator.vibrate(kind === 'heavy' || kind === 'error' ? 30 : 8);
    }
  } catch {
    /* ignore */
  }
}

export function openTelegramLink(url: string): void {
  if (inTelegram) tg!.openTelegramLink(url);
  else window.open(url, '_blank', 'noopener');
}

export function shareLink(url: string, text: string): void {
  openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
}
