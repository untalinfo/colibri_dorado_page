import { FIELD_TRUNC } from '../admin/constants.js';

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});
const HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const formatCop = (amount) => COP.format(amount);
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => HTML[c]);

// One line of customer text: whitespace flattened, cut to max with an ellipsis.
export function truncate(value, max) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// Plain text on purpose: Telegram gets no parse_mode, so user input cannot inject markup.
// Each customer field is truncated on its own, so quantity and total always survive the caption cap.
export function buildSummary(order) {
  const field = (value) => truncate(value, FIELD_TRUNC);
  return [
    `Comprobante recibido ${order.ref}`,
    `Cliente: ${field(order.customer_name)}`,
    `Teléfono: ${field(order.customer_phone)}`,
    `Dirección: ${field(order.customer_address)}`,
    `Cantidad: ${order.qty}`,
    `Total: ${formatCop(order.total_cop)}`,
  ].join('\n');
}
