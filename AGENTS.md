# Mirpur Drive: notes for AI agents

A three.js reconstruction of Mirpur, Dhaka, running in a browser tab. Plain
ES modules, Vite, no framework, no backend. `src/main.js` wires the systems
together; each world system is a `build*`/`create*` function that returns
`{ group, update, ... }`.

## Before you change anything visual

Read [docs/PERFORMANCE.md](docs/PERFORMANCE.md). The short version:

- Target: **60 fps on integrated graphics and mid-range phones.** The game is
  **GPU fill-rate bound**: pixels and overdraw matter far more than triangles.
- Every visual system needs `setDetailScale(scale)` and `setQuality(tier)`,
  registered in `src/main.js`.
- **Measure before and after** with the `readPixels` method in that guide, and
  put the numbers in the PR. If you did not run it, do not claim it. Desktop
  numbers say nothing certain about a phone: say so.
- No per-frame allocations, no per-frame raycasts, no unculled map-wide meshes,
  no new full-screen transparent layers without a tier that removes them.

## Working in this checkout

- The owner often runs several agent sessions against this same working tree.
  Ports 5183/5184 may already be serving it: open that URL, do not start
  another server. Do not switch branches, stash or reset.
- New work goes in new files. Edits to `src/main.js`, `src/traffic.js` and
  `src/metro.js` stay small and additive.
- `window.__mirpur` is the debug hook ([docs/DEBUG-HOOK.md](docs/DEBUG-HOOK.md)).
- A new key binding also goes in the help modal (`index.html`) and the README
  controls table.
- `npm run build` must pass. Verify in the browser, not by reading the code.

## The rules that apply to everything ([CONTRIBUTING.md](CONTRIBUTING.md))

1. Real beats plausible: model what is actually in Mirpur.
2. Only redistributable assets get committed. Audio and most textures are
   synthesized for that reason.
3. It has to stay fast.
