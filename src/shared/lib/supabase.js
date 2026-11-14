// Public client config only. Reads exactly three VITE_* vars; anything missing disables
// reservations (null) so the landing keeps working without a backend.
export function getReservationsConfig(env = import.meta.env) {
  const url = String(env.VITE_SUPABASE_URL ?? '')
    .trim()
    .replace(/\/+$/, '');
  const anonKey = String(env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  if (String(env.VITE_RESERVATIONS_ENABLED) !== 'true' || !url || !anonKey) return null;
  return { url, anonKey };
}

export class ApiError extends Error {
  constructor(code, status, message) {
    super(message ?? code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export const API_TIMEOUT_MS = 10_000;
export const UPLOAD_TIMEOUT_MS = 60_000;

// fetch with an AbortController deadline. An abort we triggered ourselves becomes
// ApiError('TIMEOUT'); any other failure is rethrown untouched.
export async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new ApiError('TIMEOUT', 0);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Minimal Edge Functions caller. Plain fetch keeps supabase-js (~100KB) out of the bundle.
export function createFunctionsClient(
  { url, anonKey },
  fetchImpl = globalThis.fetch.bind(globalThis),
  { timeoutMs = API_TIMEOUT_MS } = {},
) {
  const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
  return async function call(name, { query, body } = {}) {
    const qs = query ? `?${new URLSearchParams(query)}` : '';
    const init = body
      ? {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : { method: 'GET', headers };
    const res = await fetchWithTimeout(
      fetchImpl,
      `${url}/functions/v1/${name}${qs}`,
      init,
      timeoutMs,
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new ApiError(
        data?.error?.code ?? 'REQUEST_FAILED',
        res.status,
        data?.error?.message,
      );
      // Only OUT_OF_STOCK carries a public stock count (never business data).
      if (Number.isFinite(data?.available)) error.available = data.available;
      throw error;
    }
    return data;
  };
}
