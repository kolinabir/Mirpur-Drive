# P1-E6: playable-radius cull at data-build time

Owner: `tools/build-scene.mjs` (+ regenerated `public/scene.json`). Executor
E6, 2026-09-07. No `src/` edits.

Decision this implements: docs/DECISION-PLAYABLE-AREA.md, owner-decided
15:25 — playable area = within 400 m of the metro centreline; fog reaches
up to 900 m; `KEEP_RADIUS = RADIUS + 600`.

## What changed (`tools/build-scene.mjs`)

1. **CLI flag** (top of file, ~line 22-37): `--radius <metres>`, default
   `400`. `KEEP_RADIUS = RADIUS + 600` (= 1000 by default).
   `ROAD_KEEP_DIST = RADIUS + 50` (= 450 by default, matching the brief's
   "drop road ways whose every point is farther than 450 m").
2. **`distToMetro(px, pz)`** (~line 483-534, right after the metro pass):
   distance in metres from a point to the nearest metro centreline segment,
   via a bucketed spatial hash (`METRO_CELL = 100`) using the same
   expanding-ring-search pattern as the pre-existing `nearArterial` grid.
3. **Bug found and fixed during implementation — metro line clipping**
   (~line 483-513, `clipTrackToCorridor`): the raw `railway=subway` ways in
   `data/mirpur.osm.json` are the *entire* MRT Line 6 through Dhaka, not
   just the Mirpur 10 <-> Mirpur 11 corridor — the Overpass extract does not
   clip way geometry to the download bbox. The two tracks run from
   `z=-3479` to `z=3924`, far past this corridor's actual stations at
   `z=594` (Mirpur 10) and `z=-601` (Mirpur 11). Using the unclipped line
   for `distToMetro` made every building in the extract read as "close"
   (0 buildings culled on the first run) because the line's bearing runs
   roughly through the whole extract regardless of distance along the
   corridor. Fixed by clipping each track to the span between the two
   known stations (`clipTrackToCorridor`, using cumulative arc length +
   nearest-vertex-to-station lookup) before building `distToMetro`'s
   segment index. A first attempt buffered the clip by the full
   `KEEP_RADIUS` (1000 m) past each station "to be safe" and reproduced the
   exact same bug (still 0 culled) — `distToSeg` already clamps to the
   segment endpoints for points beyond them, so a small buffer
   (`CORRIDOR_CLIP_BUFFER = 50` m, just covering polyline-vertex
   granularity) is correct and a large one just re-extends the line past
   the stations.
4. **Pass 6: cull to the playable radius** (~line 570-643, after POIs/
   signals, before bounds/emit):
   - Buildings: centroid computed from the flat `p` ring; dropped if
     `distToMetro(centroid) > KEEP_RADIUS`; tagged `far: 1` if
     `RADIUS < dist <= KEEP_RADIUS`.
   - Roads: kept if **any** point on the way is within `ROAD_KEEP_DIST`
     (450 m default) of the centreline, so the drivable network inside
     `RADIUS` stays complete and a road crossing the boundary is kept
     whole; dropped only if every point is farther.
   - Areas / waterways / pois / signals: `KEEP_RADIUS` rule by centroid
     (waterways use the centroid of their flattened polyline).
   - `cullInPlace(arr, keepFn)` helper filters each array in place and
     returns `{before, after}` counts, printed to the console.
5. **`meta.playable = { radius: RADIUS, keepRadius: KEEP_RADIUS }`** added
   to the emitted scene (~line 665).

## Before / after counts (default `--radius 400`, i.e. `KEEP_RADIUS = 1000`,
`ROAD_KEEP_DIST = 450`)

| feature    | before | after  | dropped | notes                          |
|------------|-------:|-------:|--------:|---------------------------------|
| buildings  | 14,462 | 14,453 |       9 | 7,665 of the 14,453 tagged `far: 1` (400-1000 m) |
| roads      |    768 |    436 |     332 | every point > 450 m from centreline |
| areas      |     24 |     24 |       0 | all ground-cover polygons already within 1000 m |
| waterways  |      7 |      7 |       0 | same |
| pois       |  1,719 |  1,719 |       0 | same |
| signals    |      0 |      0 |       0 | extract has 0 `highway=traffic_signals` nodes |

`public/scene.json`: **1,952,642 bytes** (1.95 MB) vs. **1,953,312 bytes**
(1.95 MB) before this change — essentially unchanged. This is expected, not
a bug: per docs/DECISION-PLAYABLE-AREA.md the geometry payload was never the
bottleneck (draw calls are); the CLI flag exists so a future, larger OSM
extract (or a smaller `--radius`) will actually see file-size and building-
count reductions. See "Why so few buildings were dropped" below for the
geometric reason this particular extract barely changes.

## Why so few buildings were dropped

`data/mirpur.osm.json`'s building footprints already sit inside a tight
bounding box (X: -717..778, Z: -1180..1166, i.e. ~1495 x 2346 m) centred
almost exactly on the two stations (Mirpur 10 at z=594, Mirpur 11 at
z=-601). Verified by hand for the four bbox corners against
`distToMetro`-equivalent point-to-segment math:

- NE corner (778, 1166): ~850 m from Mirpur 10 -> **kept**
- NW corner (-717, 1166): ~1038 m from Mirpur 10 -> **dropped**
- SW corner (-717, -1180): ~807 m from Mirpur 11 -> **kept**
- SE corner (778, -1180): ~1098 m from Mirpur 11 -> **dropped**

Only the two corners on the "outside" of the diagonal corridor exceed
1000 m, and building density there is low, so only 9 of 14,462 buildings
actually fall outside `KEEP_RADIUS`. The advisor's "about half of 14,462
buildings go" estimate in docs/DECISION-PLAYABLE-AREA.md assumed a looser
extract; this one was apparently already downloaded fairly tightly around
the corridor. The cull logic itself is verified correct (see the CLI-flag
section below for a `--radius` sweep that does show large swings).

## CLI flag sanity check

Re-ran with a much smaller radius to confirm the flag and cull actually
respond (not committed to `public/scene.json` — the real regeneration used
the default `--radius 400` and is what's live now):

```
$ node tools/build-scene.mjs --radius 100
...
Culling to playable radius 100 m (keep radius 700 m)...
  buildings: 14462 -> 12457 (11937 tagged far:1)
  roads:     768 -> 118
  areas:     24 -> 23
  waterways: 7 -> 2
  pois:      1719 -> 1657
```

This confirms the flag is wired through (`RADIUS`, `KEEP_RADIUS`,
`ROAD_KEEP_DIST` all derive from it) and the cull is sensitive to it. The
final `public/scene.json` on disk was regenerated once more afterward with
the default (`npm run data`, no flag) to restore the 400 m radius before
finishing.

## Verification

- `npm run data` ran clean, printed the before/after counts above, and
  wrote a smaller/valid `public/scene.json` (confirmed valid JSON via
  `JSON.parse` in Node, `meta.playable = {"radius":400,"keepRadius":1000}`
  present, `meta.counts` matches the post-cull array lengths).
- Browser verification (page load, screenshots): **NOT completed.** The
  shared Browser pane's tab cap was reached (9 tabs already open across
  the other concurrent P0/P1 executors per `tabs_context`) every time
  `tabs_create` was called, including after two retries. Per P0-COMMON.md
  I may only act on my own dedicated tab, never another agent's, so I did
  not force a screenshot through a shared tab. See "Not done" below.

## Not done

- **`screenshots/p1-datacull-street.jpg` and
  `screenshots/p1-datacull-aerial.jpg` were not captured** — blocked by the
  Browser pane tab cap (see Verification above). The data build itself
  (`npm run data`) completed and produced valid, smaller JSON; only the
  live in-browser confirmation is outstanding. If a tab frees up later in
  this session I will retry and update this doc; otherwise this is the one
  incomplete item from the brief.
- Did not touch any file under `src/`, per the file fence.
- Did not run `git commit`.
