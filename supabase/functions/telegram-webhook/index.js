import { createTelegramWebhookHandler } from '../_shared/core/handlers/telegramWebhook.js';
import { buildDeps, loadWebhookConfig, log, telegramClientFromEnv } from '../_shared/deps.js';

const { db } = buildDeps();
// Without a bot token the client is null: every callback then fails closed inside the handler.
const telegram = telegramClientFromEnv() ?? {
  call: () => Promise.reject(new Error('telegram not configured')),
};
Deno.serve(createTelegramWebhookHandler({ db, telegram, config: loadWebhookConfig(), log }));
