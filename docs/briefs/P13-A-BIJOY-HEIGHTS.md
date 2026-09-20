# P13-A — Real satellite heights for the Bijoy Sarani district

**You own: `data/` and `public/scene-bijoy.json`. Nothing else.**
Do NOT edit any file in `src/`, `index.html`, `tools/build-scene.mjs` or
`tools/fetch-heights.mjs` (read them, don't change them). Do not commit.
Do not use browser preview tools.

## The problem

`public/scene-bijoy.json` was built WITHOUT the `--heights` side-table. Of
its 11,636 source buildings only 14 carry a `height` tag and 300 a
`building:levels`; the other **11,322 heights are guesses** from the
footprint-area heuristic. The owner asked for "each and everything ... same
real height on bijoy sarani".

The Mirpur maps already solved this: `tools/fetch-heights.mjs` samples
Google Open Buildings 2.5D Temporal and writes a per-OSM-id side table
(`data/heights-mirpur.json`, `data/heights-north.json`), which
`build-scene.mjs --heights` then prefers over every inferred value. See
`docs/NORTH-DATA.md` and the long comment in `buildingHeight()`.

## What to do

1. Read `tools/fetch-heights.mjs` and its existing invocations (check
   `docs/` and shell history in `docs/NORTH-DATA.md`) to learn the exact
   flags it wants.
2. Run it for this extract's bbox — `23.752,90.368,23.784,90.398`, input
   `data/bijoy.osm.json` — writing `data/heights-bijoy.json`.
3. Rebuild the scene WITH the heights, keeping every other flag identical
   to `npm run data:bijoy` (see package.json — do not change that script,
   just run the same thing plus `--heights data/heights-bijoy.json`).
4. Report the build's own summary line: how many heights came from
   `raster` vs `levels` vs `tag` vs `inferred`. That ratio is the whole
   point of this task — if raster coverage is poor, say so plainly with
   the number rather than declaring success.
5. Sanity-check a few known buildings and report their before/after
   heights. In particular OSM relation **18085267** (National Parliament
   House) must still be present in the output with its 177-point ring and
   14 holes intact — `node tools/smoke-sangsad.mjs` must still pass after
   your rebuild. Run it.

## If the network fetch fails

Say so, leave `public/scene-bijoy.json` as it is, and write up what you
tried. Do NOT fabricate a heights file and do NOT silently ship the
guessed heights as though they were measured. An honest "raster source
unavailable, heights still inferred" is the correct outcome in that case.

Write your findings into `docs/BIJOY-DATA.md` (append a "Heights" section,
replacing the current "no raster height pass was run" paragraph so the doc
does not contradict itself).
