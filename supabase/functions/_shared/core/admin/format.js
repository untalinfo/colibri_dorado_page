import { formatCop, truncate } from '../notify/format.js';
import { stamp } from './alerts.js';
import { CHUNK_SIZE, FIELD_TRUNC, LIST_CAP } from './constants.js';
import { USAGE } from './parse.js';

const STATUS = {
  pending_payment: 'esperando pago',
  pending_verification: 'por verificar',
  confirmed: 'confirmado',
  rejected: 'rechazado',
  expired: 'expirado',
};
const field = (value) => truncate(value, FIELD_TRUNC);

// Splits at line boundaries; a single line longer than the size is hard-split.
export function chunk(text, size = CHUNK_SIZE) {
  const out = [];
  let current = '';
  const flush = () => {
    if (current) out.push(current);
    current = '';
  };
  for (const line of String(text).split('\n')) {
    for (let i = 0; i === 0 || i < line.length; i += size) {
      const piece = line.slice(i, i + size);
      if (current && current.length + 1 + piece.length > size) flush();
      current = current ? `${current}\n${piece}` : piece;
    }
  }
  flush();
  return out;
}
export { truncate };

export const formatHelp = () => `Comandos:\n${USAGE.join('\n')}`;

// result: db.adjustStock outcome, either a typed error or { stock, available, replayed }.
export function formatAdjustment({ code, delta }, result) {
  switch (result.error) {
    case undefined:
      break;
    case 'LOT_NOT_FOUND':
      return 'Lote no encontrado. Usa /lotes para ver los códigos.';
    case 'BELOW_HELD':
      return `No se puede: hay unidades reservadas en pedidos. Reducción máxima: -${result.available}`;
    default:
      return 'No se pudo aplicar, reintenta.';
  }
  const line = `Stock ${code}: ${result.stock - delta} → ${result.stock} (disponibles ${result.available})`;
  return result.replayed ? `Ya aplicado antes. ${line}` : line;
}

const failure = (result) =>
  result.error === 'LOT_NOT_FOUND'
    ? 'Lote no encontrado. Usa /lotes para ver los códigos.'
    : 'No se pudo aplicar, reintenta.';
const replayed = (result, line) => (result.replayed ? `Ya aplicado antes. ${line}` : line);

export function formatPriceChange({ code }, result) {
  if (result.error) return failure(result);
  if (!result.changed) return `Precio ${code} sin cambios: ${formatCop(result.new)}`;
  const line = `Precio ${code}: ${formatCop(result.old)} → ${formatCop(result.new)}`;
  return replayed(result, `${line}\nLos pedidos existentes conservan su precio.`);
}

// result.new is 1 when the lot is active, 0 when paused.
export function formatActiveChange({ code }, result) {
  if (result.error) return failure(result);
  const state = result.new === 1 ? 'activo' : 'pausado';
  if (!result.changed) return `Lote ${code} ya estaba ${state}.`;
  return replayed(result, `Lote ${code} ${state}.`);
}

export function formatSummary({ days }, rows) {
  const lines = [days === 1 ? 'Resumen del último día' : `Resumen de los últimos ${days} días`];
  for (const r of rows)
    lines.push(`${STATUS[r.status] ?? r.status}: ${r.orders} pedidos · ${r.units} uds`);
  const revenue = rows.reduce((sum, r) => sum + r.revenue_cop, 0);
  lines.push(`Ingresos confirmados: ${formatCop(revenue)}`);
  return lines.join('\n');
}

export function formatLots(rows) {
  if (rows.length === 0) return 'Sin lotes';
  const lines = rows
    .slice(0, LIST_CAP)
    .map(
      (l) =>
        `${l.code} · ${field(l.name)} · ${l.available} disp. · ${formatCop(l.price_cop)} · ${l.active ? 'activo' : 'pausado'}`,
    );
  if (rows.length > LIST_CAP) lines.push(`y ${rows.length - LIST_CAP} más`);
  return lines.join('\n');
}

function age(from, now) {
  const minutes = Math.max(0, Math.floor((now - new Date(from)) / 60000));
  if (minutes < 60) return `${minutes} min`;
  return minutes < 1440 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 1440)} d`;
}

export function formatPending(rows, now) {
  if (rows.length === 0) return 'Sin pedidos pendientes';
  return rows
    .map(
      (o) =>
        `${o.ref} · ${field(o.customer_name)} · ${formatCop(o.total_cop)} · hace ${age(o.created_at, now)}`,
    )
    .join('\n');
}

export function formatOrder(o) {
  const lines = [
    `${o.ref} · ${STATUS[o.status] ?? o.status}`,
    `Lote: ${o.lots?.code ?? '-'} x${o.qty} · ${formatCop(o.total_cop)}`,
    `Cliente: ${field(o.customer_name)}`,
    `Teléfono: ${field(o.customer_phone)}`,
    `Dirección: ${field(o.customer_address)}`,
    `Creado: ${stamp(o.created_at)}`,
  ];
  if (o.decided_at)
    lines.push(`Decidido por ${o.decided_by_name ?? 'admin'} · ${stamp(o.decided_at)}`);
  return lines.join('\n');
}
