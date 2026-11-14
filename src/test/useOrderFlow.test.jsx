import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createPendingOrderStore } from '../domains/orders/infrastructure/pendingOrderStore';
import { useOrderFlow } from '../domains/orders/presentation/hooks/useOrderFlow';

const created = {
  ref: 'CD-ABC123',
  orderToken: 'tok',
  total: 76000,
  expiresAt: '2999-01-01T00:00:00.000Z',
  upload: { signedUrl: 'https://upload.test/x', path: 'p' },
  payment: { nequiNumber: '3000000000', holder: 'Titular' },
};
const values = {
  qty: 1,
  name: 'Ana Prueba',
  phone: '300 000 0000',
  address: 'Calle 1 # 2-3, Cali',
  email: '',
  consent: true,
  website: '',
};
const lot = { maxPerOrder: 6, slug: 's' };
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('useOrderFlow races', () => {
  it('discards an in-flight create-order result after reset', async () => {
    localStorage.clear();
    const gate = deferred();
    const repository = { createOrder: vi.fn(() => gate.promise) };
    const { result } = renderHook(() =>
      useOrderFlow({ repository, store: createPendingOrderStore() }),
    );
    await waitFor(() => expect(result.current.state.step).toBe('form'));

    let pending;
    act(() => {
      pending = result.current.submitForm(values, lot);
    });
    expect(result.current.state.busy).toBe(true);
    act(() => result.current.reset());
    await act(async () => {
      gate.resolve(created);
      await pending;
    });
    expect(result.current.state.step).toBe('form');
    expect(result.current.state.order).toBeNull();
  });

  it('allows a new submit right after a reset even if the old one is still in flight', async () => {
    localStorage.clear();
    const first = deferred();
    const second = deferred();
    const repository = {
      createOrder: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
    };
    const { result } = renderHook(() =>
      useOrderFlow({ repository, store: createPendingOrderStore() }),
    );
    await waitFor(() => expect(result.current.state.step).toBe('form'));
    act(() => {
      result.current.submitForm(values, lot);
    });
    act(() => result.current.reset());
    let next;
    act(() => {
      next = result.current.submitForm(values, lot);
    });
    expect(repository.createOrder).toHaveBeenCalledTimes(2);
    await act(async () => {
      second.resolve(created);
      await next;
    });
    expect(result.current.state.step).toBe('payment');
    await act(async () => {
      first.resolve({ ...created, ref: 'CD-OLD000' });
    });
    expect(result.current.state.order.ref).toBe('CD-ABC123');
  });
});
