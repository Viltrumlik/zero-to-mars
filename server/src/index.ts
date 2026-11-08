/**
 * Server entry: `node server/src/index.ts` (Node 24 native type stripping).
 * Reads env, opens the DB, starts HTTP + the Telegram bot, shuts down cleanly.
 */
import { resolve } from 'node:path';
import { buildApp } from './app.ts';
import { startBot } from './bot.ts';
import type { BotHandle } from './bot.ts';
import { openDb } from './db.ts';
import type { Db } from './db.ts';

const env = process.env;
const production = env.NODE_ENV === 'production';

const config = {
  port: Number(env.PORT) || 3000,
  host: env.HOST || '0.0.0.0',
  botToken: env.BOT_TOKEN?.trim() ?? '',
  botUsername: (env.BOT_USERNAME ?? '').trim().replace(/^@/, ''),
  appShortName: env.APP_SHORT_NAME?.trim() ?? '',
  webappUrl: env.WEBAPP_URL?.trim() ?? '',
  dbPath: resolve(env.DB_PATH || './data/game.db'),
  staticDir: resolve(env.STATIC_DIR || 'client/dist'),
  devAuth: env.DEV_AUTH === '1' || env.DEV_AUTH === 'true',
  authMaxAgeSec: Number(env.AUTH_MAX_AGE_SEC) || 86_400,
  logLevel: env.LOG_LEVEL || (production ? 'info' : 'debug'),
};

let db: Db;
try {
  db = openDb(config.dbPath);
} catch (err) {
  console.error(
    `Cannot open database at ${config.dbPath}. Make sure its directory exists and is writable ` +
      `(in Docker: sudo chown -R 1000:1000 ./data).`,
    err,
  );
  process.exit(1);
}

const app = buildApp({
  db,
  botToken: config.botToken,
  botUsername: config.botUsername,
  appShortName: config.appShortName,
  devAuth: config.devAuth && !production,
  authMaxAgeSec: config.authMaxAgeSec,
  staticDir: config.staticDir,
  logger: { level: config.logLevel },
});
const log = app.log;

if (config.devAuth && production) log.error('DEV_AUTH is ignored because NODE_ENV=production');
else if (config.devAuth) log.warn('DEV_AUTH is ON: "Authorization: dev <id>:<name>" is accepted. Never use in production!');
if (!config.botToken) {
  if (production) {
    log.fatal('BOT_TOKEN is required in production');
    db.close();
    process.exit(1);
  }
  log.warn('BOT_TOKEN is not set: Telegram auth and the bot are disabled');
}

let bot: BotHandle | null = null;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, 'shutting down');
  const force = setTimeout(() => {
    log.error('forced exit after shutdown timeout');
    process.exit(1);
  }, 10_000);
  force.unref();
  try {
    await bot?.stop();
    await app.close();
  } catch (err) {
    log.error({ err }, 'error during shutdown');
  } finally {
    db.close();
    clearTimeout(force);
    process.exit(0);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (err) => log.error({ err }, 'unhandled rejection'));

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  log.fatal({ err }, 'failed to start HTTP server');
  db.close();
  process.exit(1);
}

log.info({ db: config.dbPath, devAuth: config.devAuth && !production }, 'server ready');

if (config.botToken) {
  bot = startBot({ token: config.botToken, webappUrl: config.webappUrl, log });
} else {
  log.info('bot disabled (no BOT_TOKEN)');
}
