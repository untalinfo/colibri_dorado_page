// Build-time SEO: everything that needs the absolute site URL (canonical, og:image,
// sitemap) is derived from VITE_SITE_URL. Without it the build still works, but skips
// URL-dependent output instead of shipping broken placeholders.

export const SITE = {
  name: 'Colibrí Dorado',
  description:
    'Miel 100% pura y orgánica, sin procesar, cosechada a mano en la Finca Los Colibríes, Vereda Santa Elena, Piendamó, Cauca. Lotes limitados de floración andina.',
  ogImage: '/og-image.jpg',
  ogImageAlt: 'Frasco de miel Colibrí Dorado con un colibrí dorado en relieve',
  logo: '/apple-touch-icon.png',
  // Indexable pages, relative to the site root.
  pages: ['/', '/politica-de-privacidad.html'],
};

export function normalizeSiteUrl(raw) {
  const value = (raw ?? '').trim();
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`VITE_SITE_URL is not a valid URL: "${value}"`);
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error(`VITE_SITE_URL must use https: "${value}"`);
  }
  return url.origin;
}

const absolute = (siteUrl, path) => `${siteUrl}${path}`;

export function buildRobots(siteUrl) {
  const lines = ['User-agent: *', 'Allow: /'];
  if (siteUrl) lines.push('', `Sitemap: ${absolute(siteUrl, '/sitemap.xml')}`);
  return `${lines.join('\n')}\n`;
}

export function buildSitemap(siteUrl, lastmod) {
  const urls = SITE.pages
    .map((path) => `  <url>\n    <loc>${absolute(siteUrl, path)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function buildBusinessJsonLd(siteUrl) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: SITE.name,
    description: SITE.description,
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Finca Los Colibríes, Vereda Santa Elena',
      addressLocality: 'Piendamó',
      addressRegion: 'Cauca',
      addressCountry: 'CO',
    },
    areaServed: { '@type': 'Country', name: 'Colombia' },
    currenciesAccepted: 'COP',
  };
  if (siteUrl) {
    Object.assign(data, {
      '@id': absolute(siteUrl, '/#business'),
      url: absolute(siteUrl, '/'),
      logo: absolute(siteUrl, SITE.logo),
      image: absolute(siteUrl, SITE.ogImage),
    });
  }
  return data;
}

// Tags injected into index.html <head>. URL-dependent tags only exist with a site URL.
export function buildHeadTags(siteUrl) {
  const meta = (attrs) => ({ tag: 'meta', attrs, injectTo: 'head' });
  const tags = [
    {
      tag: 'script',
      attrs: { type: 'application/ld+json' },
      children: JSON.stringify(buildBusinessJsonLd(siteUrl)),
      injectTo: 'head',
    },
  ];
  if (siteUrl) {
    tags.push(
      { tag: 'link', attrs: { rel: 'canonical', href: absolute(siteUrl, '/') }, injectTo: 'head' },
      meta({ property: 'og:url', content: absolute(siteUrl, '/') }),
      meta({ property: 'og:image', content: absolute(siteUrl, SITE.ogImage) }),
      meta({ property: 'og:image:width', content: '1200' }),
      meta({ property: 'og:image:height', content: '630' }),
      meta({ property: 'og:image:alt', content: SITE.ogImageAlt }),
      meta({ name: 'twitter:image', content: absolute(siteUrl, SITE.ogImage) }),
    );
  }
  return tags;
}

export function seoPlugin(rawSiteUrl) {
  const siteUrl = normalizeSiteUrl(rawSiteUrl);
  return {
    name: 'colibri-seo',
    // The SSR pass (prerender) only produces a render function; assets belong to the client build.
    apply: (_config, env) => !env.isSsrBuild,
    transformIndexHtml: () => buildHeadTags(siteUrl),
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: buildRobots(siteUrl) });
      if (!siteUrl) {
        this.warn('VITE_SITE_URL is not set: skipping sitemap.xml, canonical and og:image.');
        return;
      }
      const lastmod = new Date().toISOString().slice(0, 10);
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: buildSitemap(siteUrl, lastmod) });
    },
  };
}
