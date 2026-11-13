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
    },
  };
}

export function createTelegramChannel({ client, chatId }) {
  return {
    async send(order, receiptUrl) {
      const text = buildSummary(order);
      const reply_markup = {
        inline_keyboard: [
          [
            { text: '✅ Confirmar', callback_data: `c:${order.ref}` },
            { text: '❌ Rechazar', callback_data: `r:${order.ref}` },
          ],
        ],
      };
      if (receiptUrl) {
        const pdf = order.receipt_mime === 'application/pdf';
        try {
          await client.call(pdf ? 'sendDocument' : 'sendPhoto', {
            chat_id: chatId,
            [pdf ? 'document' : 'photo']: receiptUrl,
            caption: text,
            reply_markup,
          });
          return;
        } catch {
          // Telegram could not fetch/accept the media: fall back to a text message with the link.
        }
      }
      await client.call('sendMessage', {
        chat_id: chatId,
        text: receiptUrl ? `${text}\nComprobante: ${receiptUrl}` : text,
        reply_markup,
      });
    },
  };
}
