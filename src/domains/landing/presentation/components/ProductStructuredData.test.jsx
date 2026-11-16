import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LotContext } from '../../../orders/presentation/hooks/useLot';
import ProductStructuredData, { buildProductJsonLd } from './ProductStructuredData';

const lot = { slug: 'miel-colibri-500g', name: 'Miel 500 g', priceCop: 45000, available: 3 };

describe('buildProductJsonLd', () => {
  it('maps the live lot to a Product offer in COP', () => {
    const data = buildProductJsonLd(lot, 'https://miel.co');
    expect(data.offers).toMatchObject({
      price: 45000,
      priceCurrency: 'COP',
      availability: 'https://schema.org/InStock',
    });
    expect(data.image).toBe('https://miel.co/assets/honey-bottle-luxury.jpg');
  });
  it('marks sold-out lots as OutOfStock', () => {
    expect(
      buildProductJsonLd({ ...lot, available: 0 }, 'https://miel.co').offers.availability,
    ).toBe('https://schema.org/OutOfStock');
  });
  it('returns null without a price', () => {
    expect(buildProductJsonLd(null, 'https://miel.co')).toBeNull();
    expect(buildProductJsonLd({ ...lot, priceCop: undefined }, 'https://miel.co')).toBeNull();
  });
});

describe('ProductStructuredData', () => {
  const renderWith = (value) =>
    render(
      <LotContext.Provider value={value}>
        <ProductStructuredData />
      </LotContext.Provider>,
    );

  it('renders Product JSON-LD once the lot is ready', () => {
    const { container } = renderWith({ status: 'ready', lot, refresh: () => {} });
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(JSON.parse(script.textContent)).toMatchObject({
      '@type': 'Product',
      sku: 'miel-colibri-500g',
    });
  });

  it('renders nothing while loading or without a provider', () => {
    expect(
      renderWith({ status: 'loading', lot: null, refresh: () => {} }).container,
    ).toBeEmptyDOMElement();
    expect(render(<ProductStructuredData />).container).toBeEmptyDOMElement();
  });
});
