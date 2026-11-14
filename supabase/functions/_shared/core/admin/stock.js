const KNOWN = ['INVALID_ARGS', 'LOT_NOT_FOUND', 'BELOW_HELD'];

// Maps an adjust_stock RPC response to { stock, available, replayed } or { error, available }.
// Unknown failures are rethrown so the router answers with its generic reply.
export function adjustStockResult({ data, error }) {
  if (!error) return data;
  const known = KNOWN.find((code) => error.message?.includes(code));
  if (!known) throw error;
  return { error: known, available: Number.parseInt(error.details ?? '', 10) || 0 };
}
