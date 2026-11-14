import { describe, expect, it, vi } from 'vitest';
import {
  placeOrder,
  resumeOrder,
  submitReceipt,
} from '../domains/orders/application/orderUseCases';
import {
  initialFlowState,
  orderFlowReducer,
} from '../domains/orders/presentation/hooks/useOrderFlow';
import { ApiError, createFunctionsClient } from '../shared/lib/supabase';

const values = {
  qty: 2,
  name: 'Ana Prueba',
  phone: '300 000 0000',
  address: 'Calle 1 # 2-3, Cali',
  email: '',
  consent: true,
  website: '',
};
const created = {
  ref: 'CD-ABC123',
  orderToken: 'tok',
  total: 76000,
  expiresAt: '2999-01-01T00:00:00.000Z',
  upload: { signedUrl: 'https://upload.test/x', path: 'p' },
  payment: { nequiNumber: '3000000000', holder: 'Titular', whatsapp: 'https://wa.me/573000000000' },
};
const fakeStore = () => ({ save: vi.fn(), load: vi.fn(() => null), clear: vi.fn() });
const pdf = (over = {}) => ({ size: 1000, type: 'application/pdf', ...over });

describe('placeOrder', () => {
  it('returns field errors without calling the repository', async () => {
    const repository = { createOrder: vi.fn() };
    const res = await placeOrder(repository, fakeStore(), {
      values: { ...values, name: '', consent: false },
      maxPerOrder: 6,
    });
    expect(res.errors).toMatchObject({ name: 'required', consent: 'required' });
    expect(repository.createOrder).not.toHaveBeenCalled();
  });

  it('creates the order and stores only the resume handle', async () => {
    const repository = { createOrder: vi.fn(async () => created) };
    const store = fakeStore();
    const res = await placeOrder(repository, store, { values, maxPerOrder: 6 });
    expect(res.order).toEqual(created);
    expect(repository.createOrder.mock.calls[0][0]).toMatchObject({
      qty: 2,
      consent: true,
      customer: { name: 'Ana Prueba', address: 'Calle 1 # 2-3, Cali' },
    });
    expect(store.save).toHaveBeenCalledWith({
      ref: 'CD-ABC123',
      orderToken: 'tok',
      expiresAt: created.expiresAt,
      total: 76000,
    });
    expect(JSON.stringify(store.save.mock.calls)).not.toContain('3000000000');
  });

  it('rejects a response without payment data', async () => {
    const repository = { createOrder: async () => ({ ref: 'x', orderToken: 't' }) };
    await expect(placeOrder(repository, fakeStore(), { values, maxPerOrder: 6 })).rejects.toThrow();
  });
});

describe('submitReceipt', () => {
  const order = { ref: created.ref, orderToken: 'tok', upload: created.upload };

  it('rejects an invalid file before any network call', async () => {
    const repository = { uploadReceipt: vi.fn(), submitReceipt: vi.fn() };
    await expect(
      submitReceipt(repository, fakeStore(), order, pdf({ size: 6 * 1024 * 1024 })),
    ).rejects.toMatchObject({ code: 'RECEIPT_INVALID' });
    expect(repository.uploadReceipt).not.toHaveBeenCalled();
  });

  it('uploads, submits and clears the pending store', async () => {
    const repository = { uploadReceipt: vi.fn(), submitReceipt: vi.fn(async () => ({})) };
    const store = fakeStore();
    const file = pdf();
    await submitReceipt(repository, store, order, file);
    expect(repository.uploadReceipt).toHaveBeenCalledWith(created.upload.signedUrl, file);
    expect(repository.submitReceipt).toHaveBeenCalledWith({ ref: 'CD-ABC123', orderToken: 'tok' });
    expect(store.clear).toHaveBeenCalled();
  });

  it('renews the upload URL once when the upload is rejected', async () => {
    const repository = {
      uploadReceipt: vi
        .fn()
        .mockRejectedValueOnce(new ApiError('UPLOAD_FAILED', 403))
        .mockResolvedValueOnce(undefined),
      renewUpload: vi.fn(async () => ({ upload: { signedUrl: 'https://upload.test/new' } })),
      submitReceipt: vi.fn(async () => ({})),
    };
    await submitReceipt(repository, fakeStore(), order, pdf());
    expect(repository.uploadReceipt.mock.calls[1][0]).toBe('https://upload.test/new');
  });
});

describe('resumeOrder', () => {
  it('returns null when nothing is pending', async () => {
    expect(await resumeOrder({}, fakeStore())).toBeNull();
  });

  it('renews to rehydrate payment data', async () => {
    const store = fakeStore();
    store.load.mockReturnValue({ ref: 'CD-ABC123', orderToken: 'tok', expiresAt: 'e', total: 5 });
    const repository = {
      renewUpload: vi.fn(async () => ({
        upload: created.upload,
        payment: created.payment,
        expiresAt: 'e2',
      })),
    };
    const order = await resumeOrder(repository, store);
    expect(order).toMatchObject({
      ref: 'CD-ABC123',
      total: 5,
      expiresAt: 'e2',
      payment: created.payment,
    });
  });

  it('clears the store when the hold is gone', async () => {
    const store = fakeStore();
    store.load.mockReturnValue({ ref: 'a', orderToken: 't', expiresAt: 'e' });
    const repository = {
      renewUpload: async () => Promise.reject(new ApiError('HOLD_EXPIRED', 410)),
    };
    expect(await resumeOrder(repository, store)).toBeNull();
    expect(store.clear).toHaveBeenCalled();
  });
});

describe('resumeOrder failures', () => {
  const pending = { ref: 'a', orderToken: 't', expiresAt: 'e' };

  it('clears the store and rethrows INVALID_STATE so the UI can explain it', async () => {
    const store = fakeStore();
    store.load.mockReturnValue(pending);
    const repository = {
      renewUpload: async () => Promise.reject(new ApiError('INVALID_STATE', 409)),
    };
    await expect(resumeOrder(repository, store)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(store.clear).toHaveBeenCalled();
  });

  it('keeps the stored order on a network failure', async () => {
    const store = fakeStore();
    store.load.mockReturnValue(pending);
    const repository = { renewUpload: async () => Promise.reject(new ApiError('TIMEOUT', 0)) };
    await expect(resumeOrder(repository, store)).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(store.clear).not.toHaveBeenCalled();
  });
});

describe('orderFlowReducer', () => {
  it('never throws when DONE arrives without an order (late result after reset)', () => {
    const afterReset = orderFlowReducer(initialFlowState, { type: 'RESET' });
    expect(() => orderFlowReducer(afterReset, { type: 'DONE' })).not.toThrow();
    expect(orderFlowReducer(afterReset, { type: 'DONE' })).toBe(afterReset);
    const inPayment = orderFlowReducer(initialFlowState, { type: 'ORDER_READY', order: created });
    const reset = orderFlowReducer(inPayment, { type: 'RESET' });
    expect(orderFlowReducer(reset, { type: 'DONE' })).toMatchObject({ step: 'form', order: null });
  });

  it('ignores order-dependent actions that do not match the current step', () => {
    const done = orderFlowReducer(
      orderFlowReducer(initialFlowState, { type: 'ORDER_READY', order: created }),
      { type: 'DONE' },
    );
    expect(orderFlowReducer(done, { type: 'DONE' })).toBe(done);
    const form = orderFlowReducer(initialFlowState, { type: 'RESET' });
    expect(orderFlowReducer(form, { type: 'ORDER_READY', order: undefined })).toBe(form);
    expect(orderFlowReducer(done, { type: 'FIELD_ERRORS', errors: { name: 'required' } })).toBe(
      done,
    );
  });

  it('moves a failed resume to its own step keeping the error code', () => {
    const s = orderFlowReducer(initialFlowState, { type: 'RESUME_FAILED', code: 'TIMEOUT' });
    expect(s).toMatchObject({ step: 'resume_error', errorCode: 'TIMEOUT' });
    expect(orderFlowReducer(s, { type: 'RESUME_RETRY' })).toMatchObject({
      step: 'resuming',
      errorCode: null,
    });
  });

  it('walks form -> payment -> done and resets', () => {
    let s = orderFlowReducer(initialFlowState, { type: 'ORDER_READY', order: created });
    expect(s).toMatchObject({ step: 'payment', order: created, busy: false });
    s = orderFlowReducer(s, { type: 'FAIL', code: 'TIMEOUT' });
    expect(s).toMatchObject({ step: 'payment', errorCode: 'TIMEOUT', busy: false });
    s = orderFlowReducer(s, { type: 'DONE' });
    expect(s).toMatchObject({ step: 'done', order: { ref: 'CD-ABC123' }, errorCode: null });
    expect(s.order.payment).toBeUndefined();
    expect(orderFlowReducer(s, { type: 'RESET' })).toEqual({ ...initialFlowState, step: 'form' });
  });

  it('keeps field errors and busy flags consistent', () => {
    const form = orderFlowReducer(initialFlowState, { type: 'RESET' });
    let s = orderFlowReducer(form, { type: 'BUSY' });
    expect(s.busy).toBe(true);
    s = orderFlowReducer(s, { type: 'FIELD_ERRORS', errors: { name: 'required' } });
    expect(s).toMatchObject({ busy: false, fieldErrors: { name: 'required' } });
  });
});

describe('ApiError details', () => {
  it('keeps the available count of OUT_OF_STOCK', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({ error: { code: 'OUT_OF_STOCK', message: 'x' }, available: 3 }),
        {
          status: 409,
        },
      );
    const call = createFunctionsClient({ url: 'https://x.test', anonKey: 'k' }, fetchImpl);
    await expect(call('create-order', { body: {} })).rejects.toMatchObject({
      code: 'OUT_OF_STOCK',
      available: 3,
    });
  });
});
