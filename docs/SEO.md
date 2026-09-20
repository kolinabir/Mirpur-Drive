# SEO and agent-readiness, 2026-09-20

Canonical domain: https://mirpurdrive.recalfy.com (Cloudflare Pages, DNS on
Vercel via CNAME). Everything here is static except one small Pages
middleware.

## What was wrong (audit of the first live build)

| Finding | Impact | Fix |
|---|---|---|
| Every unknown URL returned **200 + the game** (soft 404), including `/robots.txt` and `/sitemap.xml` | High: crawlers see infinite duplicate pages | `public/404.html` makes Pages return a real 404 |
| One URL on the whole site, and it is a `<canvas>` | High: nothing to rank for except the brand name | 14 place pages + hub + about/contact/privacy |
| Title 13 chars, no description, no canonical, no OG/Twitter, no JSON-LD | High | Done in `index.html` |
| Three `<h1>` on the homepage | Medium | One (the start screen); loading/gateway titles are styled non-headings |
| `*.pages.dev` serves an identical copy | Medium: duplicate host | `X-Robots-Tag: noindex` on it via `public/_headers` |
| No favicon, manifest, robots.txt, sitemap.xml | Low-medium | Added |

## The place pages (the "programmatic" part)

`tools/site-content.mjs` is hand-written content; `tools/build-site-pages.mjs`
turns it into `public/places/<slug>/` (HTML + Markdown twin), the `/places/`
hub, the trust pages, `404`, `llms.txt` and `sitemap.xml`. It runs as part of
`npm run build`, and the output is committed so the dev server serves it too.

Deliberately **14 pages, not 1400**. The rule for adding one:

- it must say something true only of that place: what it is in the real
  city, what exactly is modelled, how to reach it in the game;
- real-world facts only when well established; when unsure, leave it out;
- its own in-game capture in `public/places/img/` where one exists
  (Benarasi Palli has none yet: both attempts framed badly);
- `near` links to siblings, so nothing is an orphan; the "Go there" button
  is a deep link (`/?x=&z=`, plus `district=bijoy`) taken from
  `ALL_TELEPORT_PLACES` in `src/districts.js`, so a moved landmark moves
  its link.

The three hand-modelled Pallabi buildings share ONE page
(`pallabi-mirpur-12-street`): separately each would have been two sentences,
which is exactly the thin page this is meant to avoid. `npm test` fails if
two places share a paragraph or a page has under 500 characters of copy.

## Agent readiness

- **Markdown negotiation**: `functions/_middleware.js` serves a page's
  `index.md` twin when the client sends `Accept: text/markdown` and ranks it
  at least as high as HTML (browsers never do). `Vary: Accept` is set on
  both variants. Unknown paths return **404 with a Markdown body** that
  points at the sitemap and `llms.txt`.
- `public/_routes.json` keeps the function off textures, models, scene JSON
  and hashed bundles: those are ~100 requests a visit and would otherwise
  burn the free Functions quota (100k requests/day) at ~1000 visits.
- `public/llms.txt` has the "When to use this" / "Do not use it for"
  guidance and the deep-link format.
- JSON-LD: `VideoGame`, `WebSite`, `Organization` (with a `contactPoint`
  pointing at GitHub issues) on the homepage; `WebPage` + `BreadcrumbList`
  on place pages; `AboutPage` / `ContactPage` on the trust pages.

## Deliberately not done

- **No `PostalAddress` / phone / email in the Organization schema.** This is
  one person's hobby project; publishing a home address to satisfy a checker
  is a bad trade. Add them only if a real public contact exists.
- **No Bangla page variants / hreflang.** Worth doing, but only with a
  proper human translation of the place copy, not a machine pass.
- "Brand name discoverability" cannot be fixed in code: the domain was
  hours old when audited. It needs indexing (Search Console + sitemap
  submission) and a few real links (GitHub repo homepage is set; a post on
  r/bangladesh, r/threejs, Hacker News or a Dhaka Facebook group would do
  more than any tag).

## Verifying

```bash
npm test                      # negotiation, middleware, generated files
npm run build && npx wrangler pages dev dist --port 8799
curl -sS -i -H 'Accept: text/markdown' http://127.0.0.1:8799/ | head
curl -sS -i -H 'Accept: text/markdown' http://127.0.0.1:8799/nope | head
```
