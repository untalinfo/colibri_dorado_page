import { ApiError } from '../../../shared/lib/supabase';
import { DEFAULT_LOT_SLUG } from '../domain/lot';
import { validateOrderInput } from '../domain/orderRules';
import { validateReceiptFile } from '../domain/receiptFile';

const GONE = ['HOLD_EXPIRED', 'NOT_FOUND'];
const RECEIVED = 'INVALID_STATE';

// Returns `{ errors }` for invalid input (no network) or `{ order }` from create-order.
export async function placeOrder(repository, store, { values, maxPerOrder, lotSlug }) {
  const body = {
    lotSlug: lotSlug ?? DEFAULT_LOT_SLUG,
    qty: values.qty,
    customer: {
      name: values.name,
      phone: values.phone,
      address: values.address,
      ...(values.email?.trim() ? { email: values.email } : {}),
    },
    consent: values.consent === true,
    website: values.website ?? '',
  };
  const checked = validateOrderInput(body, maxPerOrder);
  if (!checked.ok) return { errors: checked.errors };

  const order = await repository.createOrder(body);
  if (!order?.payment || !order.upload) throw new ApiError('INVALID_RESPONSE', 200);
  store.save({
    ref: order.ref,
    orderToken: order.orderToken,
    expiresAt: order.expiresAt,
    total: order.total,
  });
  return { order };
}

export async function submitReceipt(repository, store, order, file) {
  if (!validateReceiptFile(file).ok) throw new ApiError('RECEIPT_INVALID', 0);
  const credentials = { ref: order.ref, orderToken: order.orderToken };
  try {
    await repository.uploadReceipt(order.upload.signedUrl, file);
  } catch (error) {
    // A rejected signed URL has most likely expired: renew once and retry.
    if (!(error instanceof ApiError) || error.code !== 'UPLOAD_FAILED') throw error;
    const renewed = await repository.renewUpload(credentials);
    await repository.uploadReceipt(renewed.upload.signedUrl, file);
  }
  await repository.submitReceipt(credentials);
  store.clear();
}

// Rehydrates payment data through the token-authed `renew` (never persisted locally).
export async function resumeOrder(repository, store) {
  const pending = store.load();
  if (!pending) return null;
  try {
    const renewed = await repository.renewUpload({
      ref: pending.ref,
      orderToken: pending.orderToken,
    });
    return {
      ref: pending.ref,
      orderToken: pending.orderToken,
      total: pending.total,
      expiresAt: renewed.expiresAt ?? pending.expiresAt,
      upload: renewed.upload,
      payment: renewed.payment,
    };
  } catch (error) {
    if (error instanceof ApiError && GONE.includes(error.code)) {
      store.clear();
      return null;
    }
    // The receipt already arrived: nothing left to resume, but the caller must tell the user.
    if (error instanceof ApiError && error.code === RECEIVED) store.clear();
    throw error;
  }
}
