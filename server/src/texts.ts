/** Telegram bot strings (uz / ru / en). */
import type { Lang } from '../../shared/src/types.ts';

/** Maps a Telegram `language_code` to a game language: ru*, en*, otherwise Uzbek. */
export function pickLang(code: string | undefined | null): Lang {
  const c = String(code ?? '').toLowerCase();
  if (c.startsWith('ru')) return 'ru';
  if (c.startsWith('en')) return 'en';
  return 'uz';
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface BotTexts {
  /** HTML (parse_mode: 'HTML'); `name` must already be escaped. */
  welcome: (name: string) => string;
  play: string;
  /** Fallback when the user has no first name. */
  friend: string;
  noUrl: string;
  cmdStart: string;
  cmdHelp: string;
}

export const TEXTS: Record<Lang, BotTexts> = {
  uz: {
    welcome: (name) =>
      `Salom, ${name}! 👋\n\n` +
      `🚀 <b>Noldan Marsgacha</b> — asoschi hayoti simulyatori.\n\n` +
      `Bolalikdagi birinchi kompyuter va birinchi koddan boshlang. Biznes quring, kompaniyalarni o'stiring, ` +
      `raketalar uchiring, milliarder bo'ling va insoniyatni Marsga olib boring! 🌍➡️🔴\n\n` +
      `Boshlash uchun pastdagi tugmani bosing 👇`,
    play: "🚀 O'ynash",
    friend: "do'stim",
    noUrl: "O'yin tez orada ochiladi. Biroz kuting! ⏳",
    cmdStart: "O'yinni boshlash",
    cmdHelp: "O'yin haqida",
  },
  ru: {
    welcome: (name) =>
      `Привет, ${name}! 👋\n\n` +
      `🚀 <b>С нуля до Марса</b> — симулятор жизни основателя.\n\n` +
      `Начните с первого компьютера и первого кода в детстве. Стройте бизнес, растите компании, ` +
      `запускайте ракеты, станьте миллиардером и отправьте человечество на Марс! 🌍➡️🔴\n\n` +
      `Нажмите кнопку ниже, чтобы начать 👇`,
    play: '🚀 Играть',
    friend: 'друг',
    noUrl: 'Игра скоро откроется. Чуть-чуть терпения! ⏳',
    cmdStart: 'Начать игру',
    cmdHelp: 'Об игре',
  },
  en: {
    welcome: (name) =>
      `Hi, ${name}! 👋\n\n` +
      `🚀 <b>Zero to Mars</b> — a founder life simulator.\n\n` +
      `Start with your first computer and first line of code as a kid. Build businesses, grow companies, ` +
      `launch rockets, become a billionaire and take humanity to Mars! 🌍➡️🔴\n\n` +
      `Tap the button below to play 👇`,
    play: '🚀 Play',
    friend: 'friend',
    noUrl: 'The game opens soon. Hang tight! ⏳',
    cmdStart: 'Start the game',
    cmdHelp: 'About the game',
  },
};
