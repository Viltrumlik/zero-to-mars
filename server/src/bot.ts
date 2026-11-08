/**
 * Telegram bot (grammY, long polling): greets users and opens the Mini App.
 * Runs alongside the HTTP server and never takes it down.
 */
import { Bot, GrammyError, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import type { FastifyBaseLogger } from 'fastify';
import type { Lang } from '../../shared/src/types.ts';
import { TEXTS, escapeHtml, pickLang } from './texts.ts';

export interface BotOptions {
  token: string;
  webappUrl: string;
  log: FastifyBaseLogger;
}

export interface BotHandle {
  stop(): Promise<void>;
}

const RETRY_MS = 15_000;
const STOP_TIMEOUT_MS = 5_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms).unref());

export function isHttpsUrl(v: string): boolean {
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Mini App URL for a `/start` payload: `ref_<id>` becomes `?ref=<id>`. */
export function webAppUrlFor(base: string, payload: string): string {
  const m = /^ref_(\d{1,16})$/.exec(payload.trim());
  if (!m) return base;
  const u = new URL(base);
  u.searchParams.set('ref', m[1]);
  return u.toString();
}

export function startBot(opts: BotOptions): BotHandle {
  const { log } = opts;
  const bot = new Bot(opts.token);
  const hasUrl = isHttpsUrl(opts.webappUrl);
  if (!hasUrl) log.warn('WEBAPP_URL is missing or not https; bot will reply without a play button');

  const welcome = async (ctx: Context, payload: string) => {
    const lang = pickLang(ctx.from?.language_code);
    const t = TEXTS[lang];
    const name = escapeHtml(ctx.from?.first_name?.trim() || t.friend);
    const text = hasUrl ? t.welcome(name) : `${t.welcome(name)}\n\n${t.noUrl}`;
    await ctx.reply(text, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: hasUrl ? new InlineKeyboard().webApp(t.play, webAppUrlFor(opts.webappUrl, payload)) : undefined,
    });
  };

  bot.command('start', (ctx) => welcome(ctx, typeof ctx.match === 'string' ? ctx.match : ''));
  bot.command('help', (ctx) => welcome(ctx, ''));
  bot.chatType('private').on('message', (ctx) => welcome(ctx, ''));

  bot.catch((err) => {
    log.error({ err: err.error, updateId: err.ctx.update.update_id }, 'bot handler error');
  });

  const setup = async () => {
    try {
      if (hasUrl) {
        await bot.api.setChatMenuButton({
          menu_button: { type: 'web_app', text: TEXTS.uz.play, web_app: { url: opts.webappUrl } },
        });
      }
      const commands = (lang: Lang) => [
        { command: 'start', description: TEXTS[lang].cmdStart },
        { command: 'help', description: TEXTS[lang].cmdHelp },
      ];
      await bot.api.setMyCommands(commands('uz'));
      await bot.api.setMyCommands(commands('ru'), { language_code: 'ru' });
      await bot.api.setMyCommands(commands('en'), { language_code: 'en' });
      log.info('bot menu button and commands configured');
    } catch (err) {
      log.warn({ err }, 'bot setup (menu button / commands) failed');
    }
  };

  let stopping = false;
  const run = async () => {
    while (!stopping) {
      try {
        await bot.start({
          allowed_updates: ['message'],
          onStart: (me) => {
            log.info({ username: me.username }, 'bot long polling started');
            void setup();
          },
        });
        return; // stopped normally
      } catch (err) {
        if (stopping) return;
        if (err instanceof GrammyError && err.error_code === 401) {
          log.error('BOT_TOKEN rejected by Telegram (401); bot disabled, HTTP server keeps running');
          return;
        }
        log.error({ err }, `bot polling failed; retrying in ${RETRY_MS / 1000}s`);
        await sleep(RETRY_MS);
      }
    }
  };
  void run();

  return {
    async stop() {
      stopping = true;
      try {
        await Promise.race([bot.stop(), sleep(STOP_TIMEOUT_MS)]);
      } catch (err) {
        log.warn({ err }, 'bot stop failed');
      }
    },
  };
}
