const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});
const HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const formatCop = (amount) => COP.format(amount);
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => HTML[c]);

// Plain text on purpose: Telegram gets no parse_mode, so user input cannot inject markup.
export function buildSummary(order) {
  return [
    `Comprobante recibido ${order.ref}`,
    `Cliente: ${order.customer_name}`,
    `Teléfono: ${order.customer_phone}`,
    `Dirección: ${order.customer_address}`,
    `Cantidad: ${order.qty}`,
    `Total: ${formatCop(order.total_cop)}`,
  ]
    .join('\n')
    .slice(0, 1000); // Telegram caption limit is 1024
}
