/**
 * tools/test-site.mjs — `npm test`
 *
 * Guards the crawlable / agent-facing side of the site:
 *  1. Accept-header negotiation (edge/negotiate.mjs)
 *  2. the Pages middleware, against a fake ASSETS binding
 *  3. the files tools/build-site-pages.mjs generates into public/
 *
 * Run `npm run pages` first if public/places/ is missing (npm run build does).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prefersMarkdown, qualityOf, markdownPathFor } from '../edge/negotiate.mjs';
import { onRequest } from '../functions/_middleware.js';
import { SITE, PLACES } from './site-content.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = resolve(ROOT, 'public');
const read = (rel) => readFileSync(resolve(PUB, rel), 'utf8');

// ---------------------------------------------------------------------------
test('negotiation: browsers get HTML, agents that ask get Markdown', () => {
  const chrome = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
  assert.equal(prefersMarkdown(chrome), false);
  assert.equal(prefersMarkdown('*/*'), false, 'a bare wildcard (curl) is not a request for Markdown');
  assert.equal(prefersMarkdown(null), false);
  assert.equal(prefersMarkdown(''), false);
  assert.equal(prefersMarkdown('text/markdown'), true);
  assert.equal(prefersMarkdown('text/markdown, text/html;q=0.9'), true);
  assert.equal(prefersMarkdown('text/html, text/markdown;q=0.5'), false);
  assert.equal(prefersMarkdown('text/markdown;q=0'), false);
  assert.equal(prefersMarkdown('TEXT/MARKDOWN'), true);
  assert.equal(qualityOf('text/*;q=0.3, text/html', 'text/html'), 1, 'most specific range wins');
  assert.equal(qualityOf('text/*;q=0.3, text/html', 'text/plain'), 0.3);
});

test('negotiation: page path -> Markdown twin path', () => {
  assert.equal(markdownPathFor('/'), '/index.md');
  assert.equal(markdownPathFor('/places/'), '/places/index.md');
  assert.equal(markdownPathFor('/about'), '/about/index.md');
  assert.equal(markdownPathFor('/about/index.html'), '/about/index.md');
  assert.equal(markdownPathFor('/places/index.md'), '/places/index.md');
  assert.equal(markdownPathFor('/og.jpg'), null);
  assert.equal(markdownPathFor('/scene-north.json'), null);
});

// ---------------------------------------------------------------------------
// Fake Pages runtime: ASSETS serves public/ like Pages does once a 404.html
// exists (unknown path -> 404 + the 404 page).
function fakeAssets() {
  return {
    async fetch(req) {
      let { pathname } = new URL(req.url);
      if (pathname.endsWith('/')) pathname += 'index.html';
      // The homepage is the Vite entry at the repo root; everything else is public/.
      const file = pathname === '/index.html' ? resolve(ROOT, 'index.html') : resolve(PUB, `.${pathname}`);
      if (existsSync(file) && !pathname.endsWith('/')) {
        const type = pathname.endsWith('.md') ? 'text/markdown; charset=utf-8' : pathname.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream';
        return new Response(readFileSync(file), { status: 200, headers: { 'Content-Type': type } });
      }
      return new Response(read('404.html'), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    },
  };
}

async function hit(path, accept, method = 'GET') {
  const env = { ASSETS: fakeAssets() };
  const request = new Request(`${SITE.url}${path}`, { method, headers: accept ? { Accept: accept } : {} });
  return onRequest({ request, env, next: () => env.ASSETS.fetch(request) });
}

test('middleware: homepage negotiates Markdown and always varies on Accept', async () => {
  const md = await hit('/', 'text/markdown');
  assert.equal(md.status, 200);
  assert.match(md.headers.get('Content-Type'), /^text\/markdown/);
  assert.match(md.headers.get('Vary'), /Accept/);
  const body = await md.text();
  assert.ok(body.startsWith('# Mirpur Drive'), 'Markdown body, not HTML');
  assert.ok(!/<html/i.test(body));

  const html = await hit('/', 'text/html');
  assert.equal(html.status, 200);
  assert.match(html.headers.get('Content-Type'), /^text\/html/);
  assert.match(html.headers.get('Vary'), /Accept/);

  const browser = await hit('/', 'text/html,application/xhtml+xml,*/*;q=0.8');
  assert.match(browser.headers.get('Content-Type'), /^text\/html/);
});

test('middleware: every generated page has a working Markdown twin', async () => {
  for (const path of ['/places/', '/about/', '/contact/', '/privacy/', ...PLACES.map((p) => `/places/${p.slug}/`)]) {
    const res = await hit(path, 'text/markdown');
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('Content-Type'), /^text\/markdown/, path);
    assert.ok((await res.text()).length > 200, `${path} twin is not empty`);
  }
  const noSlash = await hit('/about', 'text/markdown');
  assert.equal(noSlash.status, 200);
});

test('middleware: unknown paths are real 404s, in Markdown when asked', async () => {
  const md = await hit('/some-path-that-does-not-exist', 'text/markdown');
  assert.equal(md.status, 404);
  assert.match(md.headers.get('Content-Type'), /^text\/markdown/);
  const body = await md.text();
  assert.ok(body.length >= 20);
  assert.match(body, /sitemap\.xml/);
  assert.match(body, /llms\.txt/);

  const html = await hit('/some-path-that-does-not-exist', 'text/html');
  assert.equal(html.status, 404);
  assert.match(html.headers.get('Content-Type'), /^text\/html/);
  assert.match(html.headers.get('Vary'), /Accept/);
});

test('middleware: HEAD has no body, non-GET passes through untouched', async () => {
  const head = await hit('/', 'text/markdown', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const env = { ASSETS: fakeAssets() };
  const marker = new Response('passthrough', { status: 405 });
  const res = await onRequest({ request: new Request(`${SITE.url}/`, { method: 'POST', headers: { Accept: 'text/markdown' } }), env, next: () => marker });
  assert.equal(res, marker);
});

// ---------------------------------------------------------------------------
const htmlPages = ['places/index.html', 'about/index.html', 'contact/index.html', 'privacy/index.html', ...PLACES.map((p) => `places/${p.slug}/index.html`)];

test('generated pages: one H1, canonical, description, valid JSON-LD, Markdown twin', () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const rel of htmlPages) {
    const html = read(rel);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${rel}: exactly one h1`);
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    assert.equal(canonical, `${SITE.url}/${rel.replace(/index\.html$/, '')}`, `${rel}: self canonical`);
    const title = html.match(/<title>([^<]+)<\/title>/)[1];
    const desc = html.match(/<meta name="description" content="([^"]+)"/)[1];
    assert.ok(title.length <= 70, `${rel}: title is ${title.length} chars`);
    assert.ok(desc.length >= 50 && desc.length <= 200, `${rel}: description is ${desc.length} chars`);
    assert.ok(!titles.has(title), `${rel}: duplicate title`);
    assert.ok(!descriptions.has(desc), `${rel}: duplicate description`);
    titles.add(title);
    descriptions.add(desc);
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(m[1]);
    assert.match(html, /<html lang="en">/);
    assert.match(html, /property="og:image"/);
    assert.ok(existsSync(resolve(PUB, rel.replace(/index\.html$/, 'index.md'))), `${rel}: has a Markdown twin`);
  }
});

test('generated pages: internal links and images resolve, no orphans', () => {
  const linkedTo = new Set();
  for (const rel of [...htmlPages, '404.html']) {
    const html = read(rel);
    for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
      const target = m[1];
      const file = target.endsWith('/') ? `${target}index.html` : target;
      // "/" is the Vite entry (index.html at the repo root), not in public/.
      if (target !== '/') assert.ok(existsSync(resolve(PUB, `.${file}`)), `${rel} links to missing ${target}`);
      linkedTo.add(target);
    }
  }
  for (const p of PLACES) assert.ok(linkedTo.has(`/places/${p.slug}/`), `${p.slug} is linked from another page`);
});

test('place pages: content is specific to the place, deep link is valid', () => {
  const seen = new Set();
  for (const p of PLACES) {
    const text = [...p.real, ...p.game].join(' ');
    assert.ok(text.length > 500, `${p.slug}: only ${text.length} chars of body copy`);
    for (const para of [...p.real, ...p.game]) {
      assert.ok(!seen.has(para), `${p.slug}: paragraph reused from another place`);
      seen.add(para);
    }
    const html = read(`places/${p.slug}/index.html`);
    const play = html.match(/class="play" href="([^"]+)"/)[1].replace(/&amp;/g, '&');
    const q = new URL(play, SITE.url).searchParams;
    assert.ok(Number.isFinite(Number.parseFloat(q.get('x'))) && Number.isFinite(Number.parseFloat(q.get('z'))), `${p.slug}: deep link has coordinates`);
  }
});

test('trust pages carry real content (>= 500 characters each)', () => {
  for (const rel of ['about/index.md', 'contact/index.md', 'privacy/index.md']) assert.ok(read(rel).length >= 500, rel);
});

test('sitemap, robots, llms.txt', () => {
  const sitemap = read('sitemap.xml');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(locs.length, htmlPages.length + 1, 'homepage + every generated page, nothing else');
  assert.equal(new Set(locs).size, locs.length);
  for (const loc of locs) {
    assert.ok(loc.startsWith(`${SITE.url}/`), loc);
    const path = loc.slice(SITE.url.length);
    if (path !== '/') assert.ok(existsSync(resolve(PUB, `.${path}index.html`)), `sitemap lists missing page ${path}`);
  }
  assert.ok(!sitemap.includes('404'), '404 page is not in the sitemap');
  assert.equal((sitemap.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) || []).length, locs.length);

  assert.match(read('robots.txt'), new RegExp(`Sitemap: ${SITE.url}/sitemap.xml`));

  const llms = read('llms.txt');
  assert.ok(llms.startsWith('# Mirpur Drive'), 'llms.txt: H1 first');
  assert.match(llms, /^> /m, 'llms.txt: blockquote summary');
  assert.match(llms, /^## When to use this$/m);
  assert.match(llms, /Do not use it for/);
});

test('homepage head: metadata signals, single H1, JSON-LD identity', () => {
  const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/mirpurdrive\.recalfy\.com\/"/);
  assert.match(html, /property="og:image"/);
  assert.match(html, /property="og:type"/);
  const title = html.match(/<title>([^<]+)<\/title>/)[1];
  assert.ok(title.length <= 60, `title is ${title.length} chars`);
  const desc = html.match(/<meta name="description" content="([^"]+)"/)[1];
  assert.ok(desc.length >= 110 && desc.length <= 160, `description is ${desc.length} chars`);
  const types = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const data = JSON.parse(m[1]);
    for (const node of data['@graph'] || [data]) types.push(node['@type']);
    const org = (data['@graph'] || []).find((n) => n['@type'] === 'Organization');
    if (org) assert.ok(org.contactPoint?.contactType && org.contactPoint?.url, 'Organization has a contactPoint');
  }
  for (const t of ['VideoGame', 'WebSite', 'Organization']) assert.ok(types.includes(t), `JSON-LD ${t}`);
});
