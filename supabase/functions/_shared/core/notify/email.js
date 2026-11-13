import { fetchWithTimeout } from './fetchTimeout.js';
import { buildSummary, escapeHtml } from './format.js';

export function createEmailChannel({
  apiKey,
  from = 'onboarding@resend.dev',
  to,
  fetch,
  timeoutMs = 8000,
}) {
  return {
    async send(order) {
      const text = buildSummary(order);
      const html = `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
      const res = await fetchWithTimeout(
        fetch,
        'https://api.resend.com/emails',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            from,
            to: [to],
            subject: `Comprobante pendiente ${order.ref}`,
            text,
            html,
          }),
        },
        timeoutMs,
      );
      if (!res.ok) throw new Error(`resend http ${res.status}`);
    },
  };
}
