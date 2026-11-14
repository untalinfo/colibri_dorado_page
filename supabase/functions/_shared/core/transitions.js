// A Map, not an object literal, so keys like "constructor" or "__proto__" never resolve.
const ALLOWED = new Map([
  ['pending_payment', ['pending_verification']],
  ['pending_verification', ['confirmed', 'rejected']],
]);

export const canTransition = (from, to) => ALLOWED.get(from)?.includes(to) ?? false;

// A hold is over once it is explicitly expired, or pending_payment outlived hold_minutes.
export function isExpired(order, holdMinutes, now = new Date()) {
  if (order.status === 'expired') return true;
  if (order.status !== 'pending_payment') return false;
  return new Date(order.created_at).getTime() <= now.getTime() - holdMinutes * 60_000;
}
