// Content negotiation helpers for functions/_middleware.js. Kept outside
// functions/ (every file in there becomes a route) and free of any Workers
// API so tools/test-site.mjs can exercise them under plain Node.

/** q-value a client gives `type` in an Accept header; 0 if not acceptable. */
export function qualityOf(accept, type) {
  if (!accept) return 0;
  const [major] = type.split('/');
  let best = 0;
  let bestSpecificity = -1;
  for (const part of accept.split(',')) {
    const [range, ...params] = part.trim().split(';').map((s) => s.trim());
    if (!range) continue;
    const r = range.toLowerCase();
    const specificity = r === type ? 2 : r === `${major}/*` ? 1 : r === '*/*' ? 0 : -1;
    if (specificity < 0) continue;
    const qParam = params.find((p) => p.toLowerCase().startsWith('q='));
    const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
    // The most specific matching range decides, per RFC 9110 §12.5.1.
    if (specificity > bestSpecificity) {
      bestSpecificity = specificity;
      best = Number.isFinite(q) ? q : 0;
    }
  }
  return best;
}

/**
 * True only when the client NAMES text/markdown and ranks it at least as
 * high as HTML. A browser's `text/html,...,* / *;q=0.8` never qualifies, so
 * people always get the HTML page.
 */
export function prefersMarkdown(accept) {
  if (!accept || !/text\/markdown/i.test(accept)) return false;
  const md = qualityOf(accept, 'text/markdown');
  return md > 0 && md >= qualityOf(accept, 'text/html');
}

/** URL path of a page -> path of its Markdown twin, or null if it has none. */
export function markdownPathFor(pathname) {
  if (pathname.endsWith('.md')) return pathname;
  if (pathname.endsWith('/')) return `${pathname}index.md`;
  if (pathname.endsWith('/index.html')) return pathname.replace(/index\.html$/, 'index.md');
  if (/\.[a-z0-9]+$/i.test(pathname)) return null; // some other file type
  return `${pathname}/index.md`;
}
