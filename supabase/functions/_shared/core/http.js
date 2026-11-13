export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

export function errorResponse(status, code, message, headers = {}, extra = {}) {
  return jsonResponse({ error: { code, message }, ...extra }, status, headers);
}
