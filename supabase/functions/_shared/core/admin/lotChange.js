const KNOWN = ['INVALID_ARGS', 'LOT_NOT_FOUND'];

// Maps a change_lot RPC response to { changed, old, new, replayed } or { error }.
// Unknown failures are rethrown so the router answers with its generic reply.
export function changeLotResult({ data, error }) {
  if (!error) return data;
  const known = KNOWN.find((code) => error.message?.includes(code));
  if (!known) throw error;
  return { error: known };
}

// order_summary returns revenue_cop as bigint (string over PostgREST): coerce it.
export function summaryRows({ data, error }) {
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, revenue_cop: Number(row.revenue_cop) }));
}
