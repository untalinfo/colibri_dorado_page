import { corsHeaders, handlePreflight } from '../cors.js';
import { errorResponse, jsonResponse } from '../http.js';

// Public lot data only. Payment/contact data is never selected into the response.
export function createGetLotHandler({ db, config }) {
  return async (req) => {
    const preflight = handlePreflight(req, config.allowedOrigins);
    if (preflight) return preflight;
    const cors = corsHeaders(req.headers.get('origin'), config.allowedOrigins);

    if (req.method !== 'GET') return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use GET', cors);
    const slug = new URL(req.url).searchParams.get('slug');
    if (!slug) return errorResponse(400, 'INVALID_INPUT', 'slug is required', cors);

    try {
      const lot = await db.getLotWithAvailability(slug);
      if (!lot?.active) {
        return errorResponse(404, 'LOT_UNAVAILABLE', 'Lot not available', cors);
      }
      return jsonResponse(
        {
          lot: {
            slug: lot.slug,
            name: lot.name,
            priceCop: lot.price_cop,
            available: Number.isFinite(lot.available) ? Math.max(0, lot.available) : 0,
            maxPerOrder: lot.max_per_order,
            active: lot.active,
          },
        },
        200,
        cors,
      );
    } catch {
      return errorResponse(500, 'INTERNAL', 'Unexpected error', cors);
    }
  };
}
