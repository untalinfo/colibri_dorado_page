import { fetchWithTimeout } from './fetchTimeout.js';
import { buildSummary } from './format.js';

// Errors carry only method + status: the URL embeds the bot token and must never be logged.
export function createTelegramClient({ token, fetch, timeoutMs = 8000 }) {
  return {
    async call(method, payload) {
      const res = await fetchWithTimeout(
        fetch,
        `https://api.telegram.org/bot${token}/${method}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
        timeoutMs,
      );
      if (!res.ok) throw new Error(`telegram ${method} http ${res.status}`);
      const json = await res.json().catch(() => null);
      if (json?.ok === false) throw new Error(`telegram ${method} not ok`);
      return json?.result;
    },
  };
}

// Fan-out: each admin chat is an independent send (media -> text fallback). Failures are logged
// per chat (ref + error class only) and yield no row; the promise resolves with the successes.
export function createTelegramChannel({ client, chatIds, log = () => {} }) {
  const reply_markup = (order) => ({
    inline_keyboard: [
      [
        { text: '✅ Confirmar', callback_data: `c:${order.ref}` },
        { text: '❌ Rechazar', callback_data: `r:${order.ref}` },
      ],
    ],
  });

  const sendOne = async (chat_id, order, receiptUrl) => {
    const text = buildSummary(order);
    const markup = reply_markup(order);
    if (receiptUrl) {
      const pdf = order.receipt_mime === 'application/pdf';
      try {
        const result = await client.call(pdf ? 'sendDocument' : 'sendPhoto', {
          chat_id,
          [pdf ? 'document' : 'photo']: receiptUrl,
          caption: text,
          reply_markup: markup,
        });
        return { chatId: chat_id, messageId: result?.message_id, hasMedia: true };
      } catch {
        // Telegram could not fetch/accept the media: fall back to a text message with the link.
      }
    }
    const result = await client.call('sendMessage', {
      chat_id,
      text: receiptUrl ? `${text}\nComprobante: ${receiptUrl}` : text,
      reply_markup: markup,
    });
    return { chatId: chat_id, messageId: result?.message_id, hasMedia: false };
  };

  return {
    async send(order, receiptUrl) {
      const settled = await Promise.allSettled(
        chatIds.map((chatId) => sendOne(chatId, order, receiptUrl)),
      );
      const sent = [];
      settled.forEach((r, i) => {
        if (r.status === 'fulfilled') sent.push(r.value);
        else {
          log('telegram_send_failed', {
            ref: order.ref,
            chat_id: chatIds[i],
            error: r.reason?.name ?? 'Error',
          });
        }
      });
      return sent;
    },
  };
}
