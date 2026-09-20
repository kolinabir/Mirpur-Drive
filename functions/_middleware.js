// Cloudflare Pages middleware: Markdown content negotiation + Markdown 404s.
//
// Every generated page has a Markdown twin next to it (tools/
// build-site-pages.mjs). A client that asks for `Accept: text/markdown` — an
// AI agent, a CLI — gets the twin; everyone else gets the HTML, unchanged.
// Unknown paths already return a real 404 with public/404.html (Pages does
// that natively once a 404.html exists); here the same 404 gets a Markdown
// body when Markdown was asked for.
//
// public/_routes.json keeps this off the asset paths (textures, models,
// scene JSON, hashed bundles): those are ~100 requests per visit and must
// not count against the Functions request quota.
import { prefersMarkdown, markdownPathFor } from '../edge/negotiate.mjs';

const MARKDOWN = 'text/markdown; charset=utf-8';

function withVary(response) {
  const out = new Response(response.body, response);
  const vary = out.headers.get('Vary');
  if (!vary) out.headers.set('Vary', 'Accept');
  else if (!/\baccept\b(?!-)/i.test(vary)) out.headers.set('Vary', `${vary}, Accept`);
  return out;
}

async function markdownAsset(env, url, path) {
  const res = await env.ASSETS.fetch(new Request(new URL(path, url), { method: 'GET' }));
  // A missing twin comes back as the 404 page (or, without one, the app
  // shell with a 200): only a non-HTML 200 is the real file.
  if (res.status !== 200 || /text\/html/i.test(res.headers.get('Content-Type') || '')) return null;
  return res;
}

export async function onRequest({ request, next, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return next();

  const url = new URL(request.url);
  const wantsMarkdown = prefersMarkdown(request.headers.get('Accept'));

  if (wantsMarkdown) {
    const mdPath = markdownPathFor(url.pathname);
    const twin = mdPath && (await markdownAsset(env, url, mdPath));
    if (twin) {
      return new Response(request.method === 'HEAD' ? null : twin.body, {
        status: 200,
        headers: { 'Content-Type': MARKDOWN, 'Vary': 'Accept', 'Cache-Control': 'public, max-age=300', 'X-Robots-Tag': 'noindex' },
      });
    }
  }

  const response = await next();

  if (wantsMarkdown && response.status === 404) {
    const body = await markdownAsset(env, url, '/404.md');
    const text = body ? await body.text() : '# 404: not found\n\nNo page at this address. See /sitemap.xml or /llms.txt.\n';
    return new Response(request.method === 'HEAD' ? null : text, {
      status: 404,
      headers: { 'Content-Type': MARKDOWN, 'Vary': 'Accept', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    });
  }

  return withVary(response);
}
