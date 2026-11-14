// Storage signs URLs with the origin the function sees (SUPABASE_URL). Locally that is the
// Docker-internal http://kong:8000, which a browser cannot resolve. When PUBLIC_SUPABASE_URL is
// set (local dev only), swap the origin; in production it is unset and URLs pass through.
const trimSlash = (s) => s.replace(/\/+$/, '');

export function toPublicUrl(url, internalOrigin, publicOrigin) {
  if (!publicOrigin || !internalOrigin) return url;
  const from = trimSlash(internalOrigin);
  if (!url.startsWith(`${from}/`)) return url;
  return trimSlash(publicOrigin) + url.slice(from.length);
}
