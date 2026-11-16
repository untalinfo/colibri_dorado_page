// Injects the server-rendered landing into dist/index.html, then removes the SSR bundle.
import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT_MARKER = '<div id="root"></div>';
const dist = resolve('dist');
const ssrDir = resolve('dist-ssr');

const { render } = await import(pathToFileURL(resolve(ssrDir, 'entry-server.js')).href);
const indexPath = resolve(dist, 'index.html');
const template = await readFile(indexPath, 'utf8');

if (!template.includes(ROOT_MARKER)) {
  throw new Error(`prerender: ${ROOT_MARKER} not found in dist/index.html`);
}

const appHtml = render();
await writeFile(indexPath, template.replace(ROOT_MARKER, `<div id="root">${appHtml}</div>`));
await rm(ssrDir, { recursive: true, force: true });
console.log(`prerender: injected ${appHtml.length} chars into dist/index.html`);
