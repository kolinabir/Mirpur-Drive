# P3-MAP-GTA: GTA-style minimap + a real full map with zoom and pan

Owner (executor) files: `src/minimap.js` and `index.html` ONLY.
Docs: write `docs/MAP-PASS.md`. Screenshots: `screenshots/p3-map-*.jpg`.
Read first: `docs/briefs/P0-COMMON.md`, then `src/minimap.js`,
`src/main.js` (READ ONLY — do not edit it) and the `#minimap` / `#maphint`
CSS in `index.html`.

## Why
Owner, 2026-09-07: "clicking M doesn't open the full map! with zooming etc
like games!" and "make the minimap in GTA style!". The advisor has already
landed the plumbing (M and a click on the minimap both call
`setMapExpanded()`; the whole map fits on screen). What is missing is the
game feel: the corner map is a static north-up overview of the entire city,
and the full map has no zoom and no pan.

## Frozen interface (main.js is NOT yours; it calls exactly these)
- `new Minimap(canvasEl, scene, stations)` — `scene` is parsed scene.json
  (now `scene-north.json` by default: 55k buildings, 1,545 roads, 4
  stations, ~4.2 km of corridor), `stations` is `metro.stations`.
- `minimap.update(position, yaw)` — every frame. `position` is a
  THREE.Vector3 in metres (+X east, +Z south); `yaw` is radians.
- `minimap.setExpanded(want?)` -> boolean — toggles when `want` is omitted.
  Must return the NEW state. main.js uses the return value to show/hide
  `#maphint` and to release pointer lock.
- `minimap.expanded` — boolean property, read by main.js.
- `minimap.toggle()` — keep it working (nothing calls it now; do not delete).
- `minimap.canvas` — main.js attaches its own `click` listener to it.
Keep all of these. Anything else you need (wheel, drag, keys) you attach
yourself from inside minimap.js.

## 1. GTA-style corner minimap
- Player-CENTRED and HEADING-UP: the player arrow stays fixed at the centre
  pointing up the screen, the map rotates under it. (Rotate the base layer
  by -yaw about the player, then draw the arrow upright.)
- Zoomed IN, not the whole city: show roughly a 180-260 m radius so streets
  and the corridor are readable while walking. Pick what looks right and
  write the number in docs/MAP-PASS.md.
- Circular mask with a thin bright ring (GTA look), a small north tick that
  rotates around the ring, and the corner panel background removed behind
  the circle. Keep it in the bottom-right; ~190 px is fine.
- Roads bright over a dark ground, buildings a dark mass, the metro line in
  DMTCL teal `#00c9bd`, station blips as labelled dots. A small speed or
  distance readout is optional, not required.
- Performance: `update()` runs EVERY FRAME at 60 fps. Do NOT redraw 55k
  building footprints per frame. Pre-render the whole city ONCE into an
  offscreen base canvas (it already works this way) and per frame only
  `drawImage` the rotated/translated crop of it. Measure and record the
  per-frame cost in docs/MAP-PASS.md; if the base canvas for the north
  scene is too big for one canvas, tile it or pre-render at a lower
  metres-per-pixel and accept the softness.

## 2. Full map: zoom and pan
Opened by M or by clicking the minimap (both already wired).
- Zoom: mouse wheel centred on the cursor, and `+` / `-` keys. Clamp from
  "whole map fits" out to about 4 m/px in.
- Pan: click-drag with the mouse; also arrow keys / WASD nudge.
- Buttons or key hints for: recentre on the player (`R`), and fit-whole-map.
- North-up (do NOT rotate the full map), player arrow drawn at the right
  place and heading, all four station names labelled and always legible at
  any zoom, a scale bar in metres.
- Esc and M close it (main.js already handles those); a click on the map
  must NOT close it any more once panning exists — main.js's click listener
  toggles on `click`, so swallow the click after a drag by calling
  `e.stopPropagation()` on the mousedown/up you handle inside minimap.js,
  or set a `_justDragged` flag and have `setExpanded` ignore the immediately
  following toggle. Say in docs/MAP-PASS.md how you solved it.
- Keep the whole thing readable in the existing dark HUD palette
  (`--panel`, `--edge`, `--ink`, `--dim` in index.html).

## Fences and hazards
Two other executors are running RIGHT NOW: one owns `src/interior.js` +
`src/walkable.js`, one owns `src/city.js`. The advisor owns `src/main.js`.
Touch none of them. The page will reload under you when they save; if
`window.__mirpur` vanishes, reload and continue.

## Verification (mandatory)
Dev server is ALREADY RUNNING at http://localhost:5183 — do not start or
kill one. Load `http://localhost:5183/` (the north scene is the default
now; `?scene=old` gives the small two-station scene), wait ~28 s, click
"Enter the street" at [399,318] in an 800x450 frame.
Hidden-pane rule: rAF does not fire, so after moving the player call
`window.__mirpur.player.update(0)` then `window.__mirpur.capture()`.
Capture at least these, with distinct md5s:
- p3-map-mini-street.jpg  — the circular minimap while standing on the street
- p3-map-mini-turned.jpg  — same spot, `player.yaw` changed by ~2 rad, to
  prove the map rotates under a fixed player arrow
- p3-map-full-fit.jpg     — full map, whole corridor, all 4 stations labelled
- p3-map-full-zoom.jpg    — full map zoomed in near Mirpur 10, scale bar visible
- p3-map-full-pan.jpg     — full map panned to Uttara South
Read every screenshot back with the Read tool and describe honestly what
you see. Record the per-frame minimap cost and the HUD fps before/after in
docs/MAP-PASS.md. Take your own tab with tabs_create, pass that tabId on
every call, close it with tabs_close when done. Do not spawn sub-agents.
Do not run git commands. Never claim something you did not see rendered.

---

## OWNER CORRECTION, appended 2026-09-07 (mid-task; messaging executors is
## disabled, so re-read this file — this section OVERRIDES section 1 above)

Owner, looking at the current corner map: **"minimap isnt gta style! its way
too zoomed out! check how gta style is!"**

The "180-260 m radius" in section 1 was too loose and reads as a city
overview. Replace it with these hard numbers and behaviours:

1. **Zoom, on foot: the circle shows about 150 m ACROSS — a 75 m radius.**
   That is one or two blocks: individual side streets, the footpaths and
   the shop frontages are separable. If you can see both Mirpur 10 and
   Mirpur 11 at once, it is far too zoomed out.
2. **Speed-adaptive zoom, like GTA.** Lerp the visible diameter from 150 m
   at a standstill out to about 320 m at the car's top speed (MAX_SPEED is
   22 m/s in src/drive.js), so it opens up as you drive and closes again
   when you stop. Smooth it (a ~0.5 s time constant), never snap.
3. **Heading-up, always.** The map rotates under a player arrow that stays
   fixed at the centre pointing straight up the screen. This is the single
   most GTA-identifying property — a north-up corner map is not GTA style.
   The full map (M) stays north-up; only the corner one rotates.
4. **Look**: circular mask, thin bright ring, dark ground, roads drawn
   BRIGHT and thick enough to read at this zoom (they are the main content
   at 150 m across), buildings as a darker mass behind them, metro line in
   `#00c9bd`, station blips only when they are inside the circle, a small
   north tick rotating around the ring. Optionally a speed readout under
   the ring while driving.
5. Because the crop is now tiny, per-frame cost drops: you are blitting a
   small rotated region of the pre-rendered base canvas. If the single base
   canvas for the whole north scene is too coarse at this zoom, pre-render
   the base at a finer metres-per-pixel and tile it, or re-render a local
   patch when the player crosses a tile boundary. Record what you did and
   the per-frame cost in docs/MAP-PASS.md.

Extra screenshot required, on top of the five already listed:
- `p3-map-mini-driving.jpg` — in the car at speed (press V to drive), to
  show the zoom has opened up relative to `p3-map-mini-street.jpg`.
