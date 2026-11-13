// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The business number must never reach the repo or bundle. Built from parts so this file
// does not contain it either (the scan below includes this very file).
const PARTS = ['319', '233', '8714'];
const NUMBER = PARTS.join('');
const SPACED = PARTS.join('[\\s.-]?');
const NUMBER_RE = new RegExp(`(?:\\+?57[\\s.-]?)?${SPACED}`);
const PUBLIC_ENV_RE = new RegExp(['VITE', 'NEQUI'].join('_'), 'i');

const SKIP_DIRS = new Set(['node_modules', '.temp', '.git', 'dist']);
const SRC_EXT = new Set(['.jsx', '.js', '.css', '.html', '.json', '.md']);
const SUPABASE_EXT = new Set(['.sql', '.js', '.toml', '.md']);
const PUBLIC_TEXT_EXT = new Set([
  '.html',
  '.txt',
  '.xml',
  '.json',
  '.svg',
  '.css',
  '.js',
  '.md',
  '.webmanifest',
]);

function walk(dir, extensions) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return SKIP_DIRS.has(name) ? [] : walk(full, extensions);
    return extensions.has(extname(name)) ? [full] : [];
  });
}

const files = [
  'index.html',
  '.env.example',
  'supabase/functions/.env.example',
  ...walk('public', PUBLIC_TEXT_EXT),
  ...walk('supabase', SUPABASE_EXT),
  ...walk('src', SRC_EXT),
].filter(existsSync);

describe('no business data in the repo', () => {
  it('scans index.html, public, supabase, src and the env examples', () => {
    expect(files.length).toBeGreaterThan(10);
    for (const required of [
      'index.html',
      '.env.example',
      'supabase/functions/.env.example',
      'supabase/seed.sql',
    ]) {
      expect(files).toContain(required);
    }
    expect(files.some((f) => f.startsWith(join('src', 'domains')))).toBe(true);
    expect(files.some((f) => f.startsWith(join('supabase', 'functions')))).toBe(true);
    expect(files.some((f) => f.includes('node_modules') || f.includes('.temp'))).toBe(false);
  });

  it('never contains the business number literal', () => {
    const offenders = files.filter((f) => NUMBER_RE.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('never defines a Nequi-prefixed public env variable', () => {
    const offenders = files.filter((f) => PUBLIC_ENV_RE.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

describe('number matcher (positive control)', () => {
  const [a, b, c] = PARTS;
  const variants = {
    plain: NUMBER,
    spaced: `${a} ${b} ${c}`,
    dotted: `${a}.${b}.${c}`,
    dashed: `${a}-${b}-${c}`,
    countryCode: `+57${NUMBER}`,
    countryCodeSpaced: `+57 ${a} ${b} ${c}`,
    embedded: `Pay to ${NUMBER} today`,
  };

  for (const [label, text] of Object.entries(variants)) {
    it(`flags the ${label} variant`, () => {
      expect(NUMBER_RE.test(text)).toBe(true);
    });
  }

  it('does not flag unrelated numbers', () => {
    expect(NUMBER_RE.test('3001234567')).toBe(false);
    expect(NUMBER_RE.test('order 12345')).toBe(false);
  });

  it('flags the env prefix regardless of case', () => {
    expect(PUBLIC_ENV_RE.test(`${['vite', 'nequi'].join('_')}_number=1`)).toBe(true);
  });
});
