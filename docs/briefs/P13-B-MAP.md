# P13-B — Make the map a real map

**You own: `src/minimap.js`, `index.html`, and TWO NEW FILES you create:
`tools/build-overview.mjs` and `public/map-overview.json`.**
Do NOT touch `src/main.js`, `src/districts.js`, `src/sangsad.js`, or any
other `src/` file — three other executors are in them right now. Do not
commit. Do not use browser preview tools; the advisor verifies.

Read `src/districts.js` first: the world is now several DISTRICTS, each its
own scene file, linked by the metro.

## Owner's words (2026-09-08)

> "the map should show all the are! including uttra south - bijor sarani!
> the main big map!"
> "also zoom in zoom out! make the map better!"
> "make sure there's mark button to get navigations!"
> "also the areas are only metro names! nothing beyond that! add proper
> area names! place names! etc in the whole map!"

## Four jobs

### 1. One map of the whole line, not just the loaded district

Today `new Minimap(canvas, scene, metro.stations)` only knows the district
that is loaded, so the full map stops at that district's edge. Build a
**cross-district overview** and draw it underneath the live district:

- Write `tools/build-overview.mjs`, which reads every scene file listed in
  `public/` (`scene-north.json`, `scene-bijoy.json`) and emits a SMALL
  `public/map-overview.json` — station names + positions, the metro
  centreline polylines, the arterial road chains, water areas, and the
  named places (see job 4). Keep it under ~200 KB: this is a map, not a
  scene. Decimate polylines.
- `Minimap` fetches `map-overview.json` itself (async, non-fatal if it
  404s — fall back to exactly today's behaviour). The district that is
  actually loaded draws at full strength; the rest of the line draws
  dimmed, so it is obvious what is walkable and what is only mapped.
- The stretch with no district — Kazipara, Shewrapara — must be drawn as
  a **dashed** line with those station names in a muted style, so the map
  tells the truth: the line continues, that part is not built.

### 2. Zoom that feels like a game map

The zoom buttons exist (`#map-zoom-in` / `#map-zoom-out` / `#map-fit` /
`#map-recenter`) but the feel is poor. Make it good: mouse-wheel zoom
anchored on the cursor, drag to pan, `+`/`-`/`0`/`R` keys, smooth
(interpolated) transitions rather than instant jumps, and sensible zoom
limits from "whole line" to "read the street names". Keep the existing
buttons working.

### 3. A mark / navigate button

Add a **Mark** control. Clicking the map (in expanded mode) with Mark
active drops a waypoint; the map then draws a route line from the player
to it, and the HUD shows the bearing and remaining distance. Clicking Mark
again (or a Clear control) removes it. Keep it simple and self-contained —
straight-line bearing plus distance is fine and honest; do NOT claim
turn-by-turn routing you have not implemented. If you route along the road
graph instead, say so in the write-up.

Expose the waypoint on the Minimap instance so `main.js` could later read
it, but do NOT edit main.js to do so.

### 4. Real place names, not just metro stations

The map currently labels only the four metro stations. Every scene file
carries `pois` (with names), named `areas` (parks, lakes, university
grounds) and named `roads` — thousands of real, OSM-sourced names that are
already shipping and simply not drawn.

Add a labelling pass: neighbourhood/area names and major landmarks at low
zoom, road names and POI names as you zoom in, with collision avoidance so
labels do not overlap. Prefer `name:en` where the data has it, and keep the
Bangla name available (the station labels already show both — match that
treatment where there is room). Curate: a map with 3,000 labels is worse
than one with 30. Pick by area/importance, and say in your write-up what
rule you used.

## Acceptance

- The expanded map shows Uttara South through Bijoy Sarani in one view,
  with the unbuilt Kazipara/Shewrapara stretch visibly marked as such.
- Wheel zoom, drag pan, and the existing buttons all work.
- A waypoint can be marked and cleared, with bearing + distance shown.
- Named places appear beyond the metro stations, and do not overlap.
- `npx vite build` passes.
- Write up what you did in `docs/MAP-PASS.md` (append a P13-B section).
