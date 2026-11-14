import { createAdminCommands } from '../_shared/core/admin/commands.js';
import { createTelegramWebhookHandler } from '../_shared/core/handlers/telegramWebhook.js';
import { buildDeps, loadWebhookConfig, log, telegramClientFromEnv } from '../_shared/deps.js';

const { db } = buildDeps();
// Without a bot token the client is null: every callback then fails closed inside the handler.
const telegram = telegramClientFromEnv() ?? {
  call: () => Promise.reject(new Error('telegram not configured')),
};
const commands = createAdminCommands({ db });
Deno.serve(
  createTelegramWebhookHandler({ db, telegram, commands, config: loadWebhookConfig(), log }),
);
