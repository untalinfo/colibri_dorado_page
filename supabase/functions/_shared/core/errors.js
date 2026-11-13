// Maps reserve_order exceptions (plain P0001 messages) to HTTP status + public code.
// Anything unknown (including raw 23502/23514) is INTERNAL: validation runs before the RPC.
const MAP = {
  LOT_UNAVAILABLE: { status: 404, code: 'LOT_UNAVAILABLE' },
  INVALID_QTY: { status: 400, code: 'INVALID_INPUT' },
  RATE_LIMITED: { status: 429, code: 'RATE_LIMITED' },
  OUT_OF_STOCK: { status: 409, code: 'OUT_OF_STOCK' },
  INVALID_RATE_LIMIT: { status: 500, code: 'INTERNAL' },
};

export function mapRpcError(error) {
  const key = Object.keys(MAP).find((k) => String(error?.message ?? '').includes(k));
  return key ? MAP[key] : { status: 500, code: 'INTERNAL' };
}
