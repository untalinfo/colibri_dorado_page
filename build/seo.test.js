// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildBusinessJsonLd,
  buildLlmsTxt, buildHeadTags, buildRobots, buildSitemap, normalizeSiteUrl } from './seo.js';

describe('normalizeSiteUrl', () => {
  it('returns null when unset', () => {
    expect(normalizeSiteUrl(undefined)).toBeNull();
    expect(normalizeSiteUrl('  ')).toBeNull();
  });
  it('keeps only the origin', () => {
    expect(normalizeSiteUrl('https://miel.co/path/')).toBe('https://miel.co');
  });
  it('rejects http and garbage', () => {
    expect(() => normalizeSiteUrl('http://miel.co')).toThrow(/https/);
    expect(() => normalizeSiteUrl('miel.co')).toThrow(/valid URL/);
  });
});

describe('robots and sitemap', () => {
  it('omits the sitemap line without a site URL', () => {
    expect(buildRobots(null)).not.toMatch(/Sitemap/);
    expect(buildRobots('https://miel.co')).toMatch('Sitemap: https://miel.co/sitemap.xml');
  });
  it('lists every indexable page with absolute URLs', () => {
    const xml = buildSitemap('https://miel.co', '2026-11-15');
    expect(xml).toContain('<loc>https://miel.co/</loc>');
    expect(xml).toContain('<loc>https://miel.co/politica-de-privacidad.html</loc>');
    expect(xml).toContain('<lastmod>2026-11-15</lastmod>');
  });
});

describe('head tags', () => {
  it('only injects JSON-LD without a site URL', () => {
    const tags = buildHeadTags(null);
    expect(tags).toHaveLength(1);
    expect(buildBusinessJsonLd(null)).not.toHaveProperty('url');
  });
  it('adds canonical and absolute og:image with a site URL', () => {
    const tags = buildHeadTags('https://miel.co');
    expect(tags).toContainEqual(expect.objectContaining({ attrs: { rel: 'canonical', href: 'https://miel.co/' } }));
    expect(tags).toContainEqual(
      expect.objectContaining({ attrs: { property: 'og:image', content: 'https://miel.co/og-image.jpg' } }),
    );
  });
});

describe('llms.txt', () => {
  it('starts with an H1 and links every page', () => {
    const txt = buildLlmsTxt('https://miel.co');
    expect(txt.startsWith('# Colibrí Dorado')).toBe(true);
    expect(txt).toContain('(https://miel.co/)');
    expect(txt).toContain('(https://miel.co/politica-de-privacidad.html)');
  });
  it('uses root-relative links without a site URL', () => {
    expect(buildLlmsTxt(null)).toContain('(/politica-de-privacidad.html)');
  });
});
