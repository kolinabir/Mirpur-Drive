# Performance pass, 2026-09-21: the opening, street clutter, motion and monsoon

Covers what was added the same day: the reworked opening
(`src/intro-cinematic.js`, `src/intro-audio.js`), `src/street-clutter.js`,
`src/street-motion.js` and `src/monsoon.js`. Goal: none of it may cost a
low-end PC or a phone its 60 fps. Follows docs/PERF-PASS-2026-09-21.md.

## How it was measured

Same method as the 09-20 pass: N frames rendered back to back, synced with a
1-pixel `readPixels`, medians of alternating with/without rounds so drift
cancels. Apple M4, Pallabi spawn looking down the avenue.

The M4 is submission-bound (~3 ms) at its real resolution, so fill cost does
not show. To see it, the drawing buffer was forced to 4116 x 4920 (20 MP),
where the GPU is the bottleneck and a percentage means something on a
fill-bound machine. **Not measured on a real low-end device.**

## Results

| | before | after |
|---|---|---|
| clutter build (load time) | 141 ms | **30 ms** |
| triangles added, dry | 38.5k | **21k** |
| draw calls added | +16 dry, +5 wet | same |
| GPU, dry, native res | +0.15 ms | **+0.12 ms** |
| GPU, rain, 20 MP, high tier | +11% | **+10%** |
| GPU, rain, 20 MP, low tier | - | **+8%** |
| GPU, rain, 20 MP, minimal tier | - | **+1.6%** |
| CPU, all three `update()`s | 0.035 ms | 0.035 ms |
| opening: CPU per frame | 1.2-6.3 ms | **0.33 ms** |
| opening: frame time, real time | - | median 16.6 ms, p95 19 ms |

## What was wasted, and what changed

1. **The opening's camera-clearance check** was the worst thing found, and it
   predates this work: 13 rays a frame against building meshes with no BVH,
   plus a full `Box3.setFromObject` scan of the scene at every cut. 1.2-6.3 ms
   a frame on an M4 is the entire frame on a slow CPU. Now: one scene scan per
   intro, the 13-ray test only at cuts (which are behind black), one swept ray
   per frame between them. Street dressing opts out
   (`userData.cinematicIgnore`), because an InstancedMesh is ray-tested
   instance by instance.
2. **Parked rickshaws** are the full 852-triangle traffic model. They now use
   the same near/far split as the moving fleet (far model beyond 55 m).
3. **Bamboo and dogs**: three-sided poles, ~110-triangle dogs, and their own
   170 m draw range (a 9 cm pole is under a pixel long before 380 m).
4. **Corridor lookups** while dressing the map walked all 700 segments of the
   metro line per query, a few thousand times. A 480 m grid took the build
   from 141 to 30 ms.
5. **Wet-ground shader**: value noise came from four hashes and three mixes
   per octave, per ground pixel. It is one fetch from a 64 px tileable
   texture now. Ripples use one hash per layer instead of three and are only
   evaluated within 32 m, past which a ring is under a pixel.
6. **Puffs** are capped at 16% of screen height (10% on low). Uncapped, a
   puff drifting past the lens is a screen-sized alpha sprite. The pool is
   not drawn or uploaded when nothing is in the air.
7. **Intro grain** no longer uses `mix-blend-mode` (it forces the compositor
   to read the WebGL frame back every frame) and is removed on
   `pointer: coarse`.

What is left of the rain cost is intrinsic: the wet sheet is an alpha layer
over every visible ground pixel, about 40% of the screen at street level. The
governor absorbs +10% fill as roughly 5% linear resolution.

## Tiers

`main.js` picks one tier for all three systems (`window.__mirpur.effectsTier`):

- **high**: default.
- **low**: phones (`pointer: coarse`), <= 4 cores or <= 4 GB, Settings >
  Quality > Performance, or the perf governor's detail stage below 90%. Draw
  distances to 60%, 45% of the puffs, 60% of the birds, no tube-light pools,
  40% of the rain, one ripple layer, wet sheet to 110 m, 18 umbrellas re-posed
  every other frame. Low-end machines also build half the rooftop laundry and
  side-road festoons.
- **minimal**: governor detail <= 65% (<= 80% on a low-end machine). The wet
  sheet goes; the overcast grade, rain, flood water and umbrellas stay.

The governor's distance scale also reaches the clutter's cullers directly.

## Bug found on the way

The closing crane came down the kerb line, where the 9 m street lights stand,
and clipped one. A blocked camera was left where it was and every later ray
started behind the pole, so the shot stalled for its last two seconds and then
snapped to the player. The crane now descends over the carriageway (clear by
1.2 m everywhere, swept in the browser), moves are tested from the last
INTENDED position so one obstacle cannot stall a shot, and traffic can veto a
cut but not a move in progress.

## Platform next-train boards (`src/platform-boards.js`)

Added after the pass above, built to the same rules. The countdowns are
computed from the closed-form timetable the trains themselves follow
(`metro.arrivals()`), so they are exact rather than estimated: 1,545 arrival
checks and 60 dwell checks against the live simulation, 0 failures (at the
predicted instant exactly one train on that rail is at rest at the stop; a
quarter of a second earlier none is).

| | cost |
|---|---|
| CPU per frame, standing at a station | 0.0003 ms |
| CPU per frame, anywhere else | 0.0001 ms |
| draw calls / triangles at a station | 2 / 648 |
| textures and materials, whole district | 1 / 1 |

How: one atlas holds both board faces and a strip of LED glyphs, and a digit
is a quad whose UVs are re-pointed at another glyph. No canvas is redrawn and
no texture re-uploaded at runtime. The board sleeps until the exact instant
its next digit is due to change instead of polling. Only the station the
viewer is at is live; the rest are hidden and not evaluated.

## Not done

- The wet look as a layer at all. Folding wetness into the road materials
  (`onBeforeCompile` on the streets.js materials) would cost shader ALU only,
  no second pass over the ground. It touches five materials in a file that was
  being edited elsewhere at the time.
- The decal mesh (posters, wall writing) is one map-wide mesh, 4k triangles,
  always submitted. Cheap, but it could be tiled like the cloth.
- `buildTrainInterior()` still costs ~37 ms at the cut into the on-board shot.
  It is behind black, so it is a long black frame rather than a stutter.
