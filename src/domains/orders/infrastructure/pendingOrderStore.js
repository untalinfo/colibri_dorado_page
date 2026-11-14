const KEY = 'colibri.pendingOrder';

// Resume handle only. Payment data and upload URLs are never persisted (privacy rule);
// they are re-fetched through the token-authed `renew` action.
// Storage is resolved lazily: reading `localStorage` itself throws in some browsers
// (blocked cookies, Safari private mode). Unavailable storage degrades to a no-op store.
export function createPendingOrderStore(getStorage = () => globalThis.localStorage) {
  const resolve = typeof getStorage === 'function' ? getStorage : () => getStorage;
  const safe = (fn, fallback) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  const clear = () => safe(() => resolve().removeItem(KEY));

  return {
    // `total` is optional and public to the order owner; it lets a resumed order show the amount.
    save({ ref, orderToken, expiresAt, total }) {
      const entry = { ref, orderToken, expiresAt, ...(Number.isFinite(total) ? { total } : {}) };
      safe(() => resolve().setItem(KEY, JSON.stringify(entry)));
    },
    load() {
      const order = safe(() => JSON.parse(resolve().getItem(KEY)), null);
      const valid =
        typeof order?.ref === 'string' &&
        typeof order.orderToken === 'string' &&
        Date.parse(order.expiresAt) > Date.now();
      if (!valid) {
        clear();
        return null;
      }
      return {
        ref: order.ref,
        orderToken: order.orderToken,
        expiresAt: order.expiresAt,
        ...(Number.isFinite(order.total) ? { total: order.total } : {}),
      };
    },
    clear,
  };
}
