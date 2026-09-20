# P11-N — Minimap: no night mode, saturates to white, and uses teal

**Owner (the ONLY file you may edit): `src/minimap.js`.**
Concurrent executors own `src/night.js` and `src/sky.js`; another session
is in `src/signs.js` / `public/scene*.json`. Stay in minimap.js. Do NOT use
the browser preview tools (shared, throttled); the advisor verifies. Do not
commit.

## Finding 1 — no time-of-day response at all
`_drawBase()` paints the base map once into an offscreen canvas with fixed
colours and nothing ever re-tints it. Standing on a dark street at night,
the corner minimap is still a full-brightness daytime map — it is the
brightest object on screen and wrecks dark adaptation. `src/sky.js` exposes
`isDark` (elevation < 0.16) and `src/night.js` already fades a `factor`
0..1 for exactly this purpose; the minimap ignores both.

**Fix:** give the minimap a night palette and drive it from the same signal.
Do NOT redraw the whole base canvas every frame — it is cached on purpose.
Either keep two cached base canvases (day/night) and pick between them, or
composite a cheap darkening/tint pass over the cached base at draw time.
Say which you chose and why. The player marker, station blips and the
metro line must stay legible at night — dim the ground and buildings, not
the wayfinding.

## Finding 2 — dense areas saturate to near-white
Buildings are filled with `rgba(110,104,88,0.55)` per footprint, over a
`#14150f` ground. In dense Mirpur the footprints overlap heavily and each
pass composites another 55% toward (110,104,88), so the map saturates to a
flat light tan and the road network — drawn brighter still at
`rgba(232,224,192,0.95)` — stops being readable against it. The advisor saw
the corner map render as an almost featureless white disc around Mirpur 10,
which is also why finding 1 is so glaring at night.

**Fix:** stop the compounding. Fill all building footprints as a single
path (one `beginPath()` / many subpaths / one `fill()`) so overlapping
polygons composite once, not once per building — this also cuts a lot of
per-footprint fill calls out of the base draw. Re-check the contrast
ladder afterwards: ground darkest, buildings mid, roads bright, metro line
and stations brightest.

## Finding 3 — the minimap uses teal, which this project bans
`_drawBase()` draws the metro alignment and the inner station blips in
`#00c9bd` — teal. `src/metro.js`'s header states the rule plainly: "Brand
green #0C7A4E / #006747. No teal anywhere. (SPEC ADDENDUM A2/A3)", and
`src/signs.js` repeats it. The minimap is the one place the rule is
broken, and it is on screen constantly.

**Fix:** use the DMTCL brand green. Check every `#00c9bd` in the file —
there are several, in the corner view, the expanded map and the station
blips. Pick a green that still reads against both the day and the new night
palette; if the dark green is too low-contrast on the dark ground, lighten
the line's green rather than reaching for teal.

## Acceptance (the advisor will check live)
1. At night the minimap is visibly dimmer than at midday and is no longer
   the brightest thing on screen; the player marker, stations and metro
   line remain readable.
2. Around Mirpur 10 the map reads as a map — roads legible against
   buildings, not a white disc.
3. No `#00c9bd` (or any other teal) left anywhere in the file.
4. Midday appearance is otherwise unchanged, and FPS is no worse — the
   base canvas must not be rebuilt per frame.

Append a dated section to `docs/MAP-PASS.md` and report back with the
palette you chose and how you wired the night signal.
