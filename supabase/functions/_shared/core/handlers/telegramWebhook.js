import { isAdminCallback } from '../admin/admins.js';
import { adminDisplayName, syncDecision } from '../admin/alerts.js';
import { errorResponse, jsonResponse } from '../http.js';

const DATA = /^(c|r):(CD-[A-Z0-9]{6})$/;
const STATUS = { c: 'confirmed', r: 'rejected' };
const LABEL = { confirmed: '✅ Confirmado', rejected: '❌ Rechazado' };

// Constant-time: always walks the longer input so neither content nor length short-circuits.
export function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(String(a ?? ''));
  const y = enc.encode(String(b ?? ''));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

const DECIDED = new Set(Object.keys(LABEL));

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
  // The tapped message always counts, even for legacy orders with no stored copies.
  const copiesOf = async (order, tapped, ref) => {
    let rows = [];
    try {
      rows = await db.listAdminMessages(order.id);
    } catch (err) {
      log('admin_messages_failed', { ref, error: err?.name ?? 'Error' });
    }
    const sameChat = (r) => String(r.chat_id) === String(tapped.chat_id);
    return [tapped, ...rows.filter((r) => !sameChat(r))];
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
      const adminIds = config.adminIds ?? [];
      if (adminIds.length === 0) log('admin_config_empty', {});
      if (!isAdminCallback(query, adminIds)) {
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
      const name = adminDisplayName(query.from);

      const { changed, order } = await db.setDecision(ref, status, String(query.from.id), name);
      const message = query.message;
      const tapped = {
        chat_id: message.chat.id,
        message_id: message.message_id,
        has_media: Boolean(message.photo || message.document),
      };
      if (order && DECIDED.has(order.status)) {
        const decided = {
          ...order,
          decided_at: order.decided_at ?? now().toISOString(),
          decided_by_name: order.decided_by_name ?? name,
        };
        // A decision updates every admin's copy; a repeated tap only syncs the tapped one.
        const targets = changed ? await copiesOf(order, tapped, ref) : [tapped];
        await syncDecision({ telegram, log, targets, order: decided });
      }
      await answer(query.id, changed ? LABEL[status] : 'Ya procesado');
    } catch (err) {
      log('webhook_error', { ref, error: err?.name ?? 'Error' });
      await answer(query.id, 'Error, intenta de nuevo');
    }
    return ok();
  };
}
