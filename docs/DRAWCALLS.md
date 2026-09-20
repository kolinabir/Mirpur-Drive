# P1-C draw-call audit and merge

Owners so far: P1-C-streets (`src/streets.js`). Other P1-C executors
(`src/metro.js`, `src/interior.js`) append their own sections below when
they run.

## Method

Browser tab navigated to `http://localhost:5183?debug`, "Enter the street"
clicked, `window.__mirpur.player.update(0)` + `window.__mirpur.capture()`
per the P0-COMMON gotcha (pane hidden the whole session). Per-group counts
were taken by toggling `object.visible = false/true` and diffing
`renderer.info.render.calls` before/after (not a static child count — this
captures actual on-screen/frustum-culled draws for that view).

## Top-level scene group audit (start view, "Enter the street")

| Group | Draw calls (delta) | Owner file |
|---|---:|---|
| **Total (`renderer.info.render.calls`)** | **747** | — |
| `buildings` | 190 | city.js (not mine) |
| `streets` | 25 | **streets.js** |
| `shop-signs` | 2 | signs.js (not mine) |
| `metro` | 472 | metro.js (not mine) |
| `traffic` | 31 | not mine |
| `pedestrians` | 2 | not mine |

`metro` is by far the largest contributor at the start view (472 of 747,
63%) — flagging for the metro.js P1-C executor, since it's well outside
what I can touch under the file fence (P0-COMMON: "never touch another
owner's file").

## `streets` group breakdown (start view)

| Mesh / bucket (`streets.js` source) | Draw calls | Notes |
|---|---:|---|
| `ground` | 1 | single `PlaneGeometry` |
| `area:pitch` | 1 | one mesh per land-use kind (already bucketed by `meshFrom`, `buildStreets()` ~line 815-827) |
| `area:park` | 1 | " |
| `area:bare` | 1 | " |
| `area:water` | 0 | not in frustum this view |
| `area:cemetery` | 1 | " |
| `area:wood` | 1 | " |
| `waterways` | 1 | one ribbon mesh for all waterway segments |
| `roads-major` | 1 | rank>=4, bucketed (`buildStreets()` ~line 889-908) |
| `roads-secondary` | 1 | rank==3 |
| `roads-minor` | 1 | rank==2 |
| `roads-service` | 1 | rank==1 |
| `footpaths` | 0 | rank==0, not in frustum this view |
| `metro-corridor-road` (group) | 4 | `metro-carriageways`, `metro-median`, `metro-footpaths`, `metro-kerbs` — one mesh per material, `buildMetroCorridorRoad()` ~line 184-243 |
| `sidewalks` | 1 | arterial-flanking footpath ribbon, one mesh |
| `kerbs` | 1 | one mesh |
| `lane-dashes` | 0 | not in frustum this view (dashes only exist on arterials without a median) |
| `medians` | 1 | one mesh |
| `street-furniture` (group) | 5 | streetlight pole+arm+head, power-pole shaft+crossarm, cables — `buildStreetFurniture()` ~line 422-750, all already `InstancedMesh`/`LineSegments` |
| **`streets` total** | **25** | 3.3% of the 747 at start view |

Aerial view (key 4): `streets` total is **23** (same buckets, `area:water`
newly visible, `roads-service`/`footpaths` out of frustum) — see table
below.

## Decision: no merge needed in `streets.js`

The brief's threshold is "merge whatever you own that costs more than ~10
calls" (per bucket). **Every bucket in `streets.js` is already at or under
5 draw calls** — `area:*` is one mesh per land-use kind (6, none
individually near 10), the OSM road ranks are one mesh per rank (5), the
metro corridor road is one mesh per material (4), and street furniture is
already `InstancedMesh` per part type (5, plus one `LineSegments` for
cables). This bucketing was already done by prior executors (E1/E1b, see
`docs/ROAD-PASS.md`) via the shared `meshFrom()` helper — nothing in this
file was left as one-mesh-per-source-feature.

I looked for one further opportunity: the cobra-head streetlight's pole
(`poleGeo`, cylinder) and arm (`armGeo`, box) share the same material
(`poleMat`, `buildStreetFurniture()` ~line 646-651) and could be merged
into a single pre-instanced `BufferGeometry` (via
`three/addons/utils/BufferGeometryUtils.js`, already used by `metro.js`)
to drop from 3 `InstancedMesh` draws (pole/arm/head) to 2 for the light
group. I did not make this change: the saving is one draw call out of a
747-call frame (0.1%), `streets.js`'s total share is already only 25
calls, and merging would mean the merged mesh's `castShadow` flag now
applies uniformly to both parts (currently only the pole casts a shadow;
the arm doesn't) — a real, if tiny, look change for a change the brief's
own ">~10 calls" threshold doesn't ask for. Flagging here rather than
taking the risk.

**No code changes were made to `src/streets.js` in this pass.**
`streets.js` was already well under the per-bucket threshold before I
started; the file's contribution to the 747/683 (start/aerial) frame total
is small (25/23, ~3%) and not where the >300-draw-call budget is being
spent — that's `metro` (472/448, ~65%), which is out of my file fence.

## Draw calls before / after, streets groups and whole frame

Since no merge was made, before == after for everything I own. Captured
both to satisfy the brief's ask and as a clean baseline for whoever
tackles `metro.js` next.

| View | Whole frame (before) | Whole frame (after) | `streets` group (before) | `streets` group (after) |
|---|---:|---:|---:|---:|
| Street (start view, post "Enter the street") | 747 | 747 | 25 | 25 |
| Aerial (key 4, `?debug`) | 683 | 683 | 23 | 23 |

(P0-E1's ROAD-PASS.md entry recorded 705 draws/1834k tris at the street
view before P0-E1b's pole relocation pass, and 648 at aerial with the old
`pad=400` ground plane; today's higher totals — 747/683 — reflect other
concurrent work this pass, not anything in `streets.js`, which added no
meshes since E1b.)

## Screenshots (visual no-regression check)

Captured via `window.__mirpur.player.update(0)` + `window.__mirpur.capture()`
(pane was hidden), JPEG quality 0.7 for street/under, default for aerial.

| File | md5 | View | Notes |
|---|---|---|---|
| `screenshots/p1-draws-street.jpg` | `d3bffa08ac03bdfca7fbe56d41924716` | Key 1 (Mirpur 10 approach / under viaduct), start view | Matches P0's `p0-road-street.jpg`/`p0-poles-key1.jpg` framing — dust/asphalt ground, cobra-head lights on the footpath edges, no poles in the lanes. |
| `screenshots/p1-draws-under.jpg` | `5ae48a4982353c65c6c26a06f597b9f6` | `player.position.set(-33, 3, -124)`, same spot as P0-E1b's `p0-poles-under.jpg`, facing +X this time (`yaw = PI/2`, mirrored left-right vs the earlier shot) | Both carriageways and the pier visible, cables stay on their own footpath side, no pole in the lanes — same as E1b's finding, confirming no regression from this pass (which made no edits). |
| `screenshots/p1-draws-aerial.jpg` | `2cfb42ae307ece984eae31859739b79c` | Key 4, aerial, `?debug` | Ground plane, corridor, and density read the same as P0-E1's `p0-road-aerial.jpg`; horizon seam is the same known-not-fully-fixed state E1 already documented (not touched here). |

All three are distinct, non-trivial files (128-241 KB).

## Not done / follow-ups

- No code merge in `src/streets.js` — see "Decision" above; nothing here
  crosses the brief's own ~10-calls-per-bucket threshold.
- The frame is still far over the <300 target at the start view (747), but
  the responsible group is `metro` (472 draws, 63% of the frame) —
  `src/metro.js` is not in my file fence (P1-C row: "src/metro.js,
  src/interior.js, src/streets.js (sequential, one at a time)"). Flagging
  loudly here so the metro.js P1-C executor sees it first.
- Did not re-verify the P0-E1-documented aerial horizon seam or the
  `main.js` render-loop error mentioned in earlier ROAD-PASS.md entries —
  out of scope for this brief and outside my file fence.
