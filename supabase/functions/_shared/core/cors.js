const ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type';

export function corsHeaders(origin, allowedOrigins = []) {
  if (!origin || !allowedOrigins.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': ALLOW_HEADERS,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    vary: 'Origin',
  };
}

// Returns a Response for OPTIONS requests, null otherwise.
export function handlePreflight(req, allowedOrigins) {
  if (req.method !== 'OPTIONS') return null;
  const headers = corsHeaders(req.headers.get('origin'), allowedOrigins);
  return new Response(null, {
    status: headers['access-control-allow-origin'] ? 204 : 403,
    headers,
  });
}
