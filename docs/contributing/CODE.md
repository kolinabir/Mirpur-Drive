# Code contributions

Plain JavaScript ES modules, Three.js and Vite. No framework, no TypeScript,
no backend. The README's *Project layout* table maps files to systems.

## Running and checking

```bash
npm run dev       # dev server with HMR
npm run build     # must pass before you open a PR
npm run preview   # serve the production build on :4173
npm run smoke     # headless smoke test of the Sangsad district
```

There is no unit-test suite; verification is done in the running game. Add
`?debug` to the URL (or set `localStorage.mirpurDebug = '1'`) for the debug
affordances, and use `window.__mirpur` in the console to reach the player,
collision, drive and streetlife objects (`docs/DEBUG-HOOK.md`).

## Style

- Match the file you are in: naming, comment density, module shape.
- Comments explain **why** — the measurement, the real-world fact, the bug
  that a line prevents. This codebase leans on them heavily; keep that up.
- No new runtime dependencies without discussion. The shipped bundle is
  `three` + `earcut` and should stay close to that.
- Keep modules independent: a system exposes a build/update function that
  `src/main.js` wires in. Avoid reaching into another module's internals.

## Performance is a feature

**Read [docs/PERFORMANCE.md](../PERFORMANCE.md) first**: what is expensive in
this game, how to measure it, and the checklist a change has to pass. The
points below are the summary.

- **Draw calls:** merge static geometry, instance repeated props
  (`docs/DRAWCALLS.md`, `docs/LOD-PASS.md`).
- **Streaming:** the city loads in tiles around the player
  (`docs/STREAMING.md`); new world content must stream or be cheap enough not
  to.
- **First load:** anything not needed for the first frame should load after
  it. First load was deliberately cut from ~6 s to ~2 s — don't give it back.
- **Per-frame allocations:** none in hot paths; reuse vectors and arrays.
- **Mobile:** touch controls live in `src/mobile-controls.js`. If you add a
  key binding, add its touch equivalent or say why there isn't one, and add
  the key to the help modal in `index.html` and the README table.

Report what you measured: FPS before/after at Mirpur 10 golchokkor in
daylight with traffic is the usual yardstick.

## Where help is wanted

- Local vehicles and their behaviour (rickshaws, CNGs, buses) in traffic.
- Pedestrian variety and animation.
- Mobile performance and controls.
- Accessibility: remappable keys, reduced motion, readable HUD scaling.
- Bangla localisation of the HUD and menus.
- More of MRT Line 6: the Kazipara / Shewrapara gap between the two districts.

## About the `docs/` folder

`docs/` is the project's working log: design decisions, measured constants
and honest post-mortems for each development pass, including the task briefs
(`docs/briefs/`) used while building it with AI coding assistants. It is
history rather than polished documentation, but it is usually the fastest way
to learn why a system is the way it is — search it before changing one. If
your change invalidates something written there, add a dated note rather than
rewriting the past.
