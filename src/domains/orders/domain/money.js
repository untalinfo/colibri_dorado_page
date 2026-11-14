export function formatCOP(amount) {
  const n = Math.round(Number(amount) || 0);
  return `$${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}
