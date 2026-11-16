import { useLot } from '../../../orders/presentation/hooks/useLot';

const PRODUCT_IMAGE = '/assets/honey-bottle-luxury.jpg';

// Product + Offer for rich results. Built from the live lot so price and stock never go
// stale; Google renders JS and reads JSON-LD anywhere in the document.
export function buildProductJsonLd(lot, origin) {
  if (!lot || !Number.isFinite(lot.priceCop)) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: lot.name || 'Miel Colibrí Dorado',
    description:
      'Miel 100% pura y cruda, sin procesar, cosechada a mano en la Finca Los Colibríes, Piendamó, Cauca.',
    image: `${origin}${PRODUCT_IMAGE}`,
    sku: lot.slug,
    brand: { '@type': 'Brand', name: 'Colibrí Dorado' },
    offers: {
      '@type': 'Offer',
      url: `${origin}/`,
      price: lot.priceCop,
      priceCurrency: 'COP',
      availability:
        lot.available > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      areaServed: 'CO',
    },
  };
}

export default function ProductStructuredData() {
  const { status, lot } = useLot();
  if (status !== 'ready') return null;
  const data = buildProductJsonLd(lot, window.location.origin);
  if (!data) return null;
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: serialized JSON-LD, no user HTML.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
