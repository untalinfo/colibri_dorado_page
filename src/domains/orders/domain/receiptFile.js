// Mirrors the private `receipts` bucket rules (the bucket enforces them again on upload).
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const RECEIPT_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export function validateReceiptFile(file) {
  if (!file || !(file.size > 0)) return { ok: false, error: 'empty' };
  if (!RECEIPT_MIMES.includes(file.type)) return { ok: false, error: 'type' };
  if (file.size > MAX_RECEIPT_BYTES) return { ok: false, error: 'size' };
  return { ok: true };
}
