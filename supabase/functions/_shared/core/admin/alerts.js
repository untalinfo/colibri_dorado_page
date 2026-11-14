import { buildSummary } from '../notify/format.js';

const LABEL = { confirmed: '✅ Confirmado', rejected: '❌ Rechazado' };
const NAME_MAX = 32;
const FALLBACK_NAME = 'admin';
// Spec: captions < 1024 and texts < 4096 (strictly under Telegram's limits).
const CAPTION_MAX = 1023;
const TEXT_MAX = 4095;

// Same rendering for every copy (D6): rebuilt from the order, never from the tapped message.
export function adminDisplayName(from) {
  const name = String(from?.first_name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
  return name || FALLBACK_NAME;
}

export const stamp = (value) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Bogota',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(value))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}`;
};

export function renderDecided(order, limit) {
  const line = `\n\n${LABEL[order.status]} por ${order.decided_by_name || FALLBACK_NAME} · ${stamp(order.decided_at)}`;
  return buildSummary(order).slice(0, limit - line.length) + line;
}

// allSettled: a blocked/deleted chat never fails the decision nor the other edits.
export async function syncDecision({ telegram, log, targets, order }) {
  const reply_markup = { inline_keyboard: [] };
  const settled = await Promise.allSettled(
    targets.map((t) => {
      const base = { chat_id: String(t.chat_id), message_id: t.message_id, reply_markup };
      return t.has_media
        ? telegram.call('editMessageCaption', {
            ...base,
            caption: renderDecided(order, CAPTION_MAX),
          })
        : telegram.call('editMessageText', { ...base, text: renderDecided(order, TEXT_MAX) });
    }),
  );
  settled.forEach((r, i) => {
    if (r.status === 'rejected') {
      log('decision_sync_failed', {
        ref: order.ref,
        chat_id: String(targets[i].chat_id),
        error: r.reason?.name ?? 'Error',
      });
    }
  });
}
