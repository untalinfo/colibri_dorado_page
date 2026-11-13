import { errorResponse, jsonResponse } from '../http.js';

const DATA = /^(c|r):(CD-[A-Z0-9]{6})$/;
const STATUS = { c: 'confirmed', r: 'rejected' };
const LABEL = { confirmed: '✅ Confirmado', rejected: '❌ Rechazado' };
// Telegram rejects edits over these lengths, which would leave the buttons in place.
const CAPTION_LIMIT = 1024;
const TEXT_LIMIT = 4096;

// Constant-time: always walks the longer input so neither content nor length short-circuits.
export function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(String(a ?? ''));
  const y = enc.encode(String(b ?? ''));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

const ok = () => jsonResponse({ ok: true }, 200);

// Authenticated requests always get 200 (even on internal errors) so Telegram does not retry-storm.
// Unauthenticated requests get 401; an unset secret rejects everything (fail closed).
export function createTelegramWebhookHandler({
  db,
  telegram,
  config,
  log = () => {},
  now = () => new Date(),
}) {
  const safeCall = async (method, payload) => {
    try {
      await telegram.call(method, payload);
    } catch (err) {
      log('webhook_telegram_failed', { method, error: err?.name ?? 'Error' });
    }
  };
  const answer = (id, text) => safeCall('answerCallbackQuery', { callback_query_id: id, text });

  return async (req) => {
    const secret = config.webhookSecret;
    const header = req.headers.get('x-telegram-bot-api-secret-token');
    if (!secret || !header || !safeEqual(header, secret)) {
      return errorResponse(401, 'UNAUTHORIZED', 'Unauthorized');
    }
    if (req.method !== 'POST') return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use POST');

    let update;
    try {
      update = await req.json();
    } catch {
      return ok();
    }
    const query = update?.callback_query;
    if (!query?.id) return ok();

    let ref;
    try {
      const owner = String(config.ownerChatId ?? '').trim();
      const message = query.message;
      const isOwner =
        owner !== '' && String(query.from?.id) === owner && String(message?.chat?.id) === owner;
      if (!isOwner) {
        await answer(query.id, 'Acción no disponible');
        return ok();
      }

      const match = DATA.exec(typeof query.data === 'string' ? query.data : '');
      if (!match) {
        await answer(query.id, 'Acción no válida');
        return ok();
      }
      ref = match[2];
      const status = STATUS[match[1]];

      const { changed } = await db.setDecision(ref, status);
      if (!changed) {
        await answer(query.id, 'Ya procesado');
        return ok();
      }

      const suffix = `\n\n${LABEL[status]} · ${now().toISOString()}`;
      const hasMedia = Boolean(message.photo || message.document);
      const original = (hasMedia ? message.caption : message.text) ?? '';
      const reply_markup = { inline_keyboard: [] };
      if (hasMedia) {
        await safeCall('editMessageCaption', {
          chat_id: String(message.chat.id),
          message_id: message.message_id,
          caption: original.slice(0, CAPTION_LIMIT - suffix.length) + suffix,
          reply_markup,
        });
      } else {
        await safeCall('editMessageText', {
          chat_id: String(message.chat.id),
          message_id: message.message_id,
          text: original.slice(0, TEXT_LIMIT - suffix.length) + suffix,
          reply_markup,
        });
      }
      await answer(query.id, LABEL[status]);
    } catch (err) {
      log('webhook_error', { ref, error: err?.name ?? 'Error' });
      await answer(query.id, 'Error, intenta de nuevo');
    }
    return ok();
  };
}
