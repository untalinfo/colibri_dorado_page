// Payment links come from the server; render them only when they are plainly safe.
const WHATSAPP_HOST = 'wa.me';

function parseHttps(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export const safeHttpsUrl = (value) => (parseHttps(value) ? value : null);

export const safeWhatsappUrl = (value) =>
  parseHttps(value)?.hostname === WHATSAPP_HOST ? value : null;
