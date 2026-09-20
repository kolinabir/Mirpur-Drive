# P2-E8: north-corridor data (Mirpur 10 -> Uttara South)

Executor E8, 2026-09-07. Owner files: `data/query-north.overpassql`,
`data/north.osm.json`, `tools/build-scene.mjs` (extended, default behaviour
unchanged), `public/scene-north.json` (new output). `public/scene.json` and
`data/mirpur.osm.json` were left untouched (verified byte-identical
`public/scene.json` after a default-args regression run — see "Backward
compatibility" below). No `src/` edits.

## 1. Extent found via Overpass

Line 6 stations (`node["railway"~"station|stop"]` in bbox
`23.78,90.33,23.88,90.42`, English name):

| station      | lat        | lon        |
|--------------|-----------:|-----------:|
| Mirpur 10    | 23.8083649 | 90.3682614 |
| Mirpur 11    | 23.8190959 | 90.3652809 |
| Pallabi      | 23.8261574 | 90.3641863 |
| Uttara South | 23.8459044 | 90.3631526 |

(Also present in the extract but out of scope per owner decision 17:55 in
docs/DECISION-PLAYABLE-AREA.md: Kazipara 23.7992/90.3720 and Shewrapara
23.7910/90.3755, both south of Mirpur 10; Uttara Center 23.8597/90.3651 and
Uttara North 23.8691/90.3675, both north of Uttara South. These are excluded
from `metro.stations` via `--stations` and never pull the metro clip range
past Mirpur 10 / Uttara South — see "Station whitelist" below.)

Other named places used to anchor the two arterial arms (via
`node["name"~...]` / `way["name"~...]` searches):

- Mirpur 1: "Mirpur 1 Squre" node 9579175117 (23.7998825, 90.3553259),
  "Mirpur 1 Gol Chattar" way 1300893956 (23.7997, 90.3552).
- Mirpur 2 / Sony junction: "Mirpur 2" node 4583633891 (23.8049338,
  90.363713), "Sony Square" node 3016666169 (23.8005271, 90.3550979).
- Mirpur 13/14, Kachukhet: "Mirpur-14 Bus Station" node 3516766838
  (23.7985377, 90.3869725), "Kachukhet Bus Stop" node 13270092103
  (23.7928066, 90.3880232), "Kachukhet Old Bazar Mosque" node 13270057728
  (23.7935577, 90.3902815).

## 2. Bounding box used

`data/query-north.overpassql`: `23.787,90.344,23.855,90.395`
(lat 23.787-23.855, lon 90.344-90.395), a ~500 m margin around the
Mirpur-10-to-Uttara-South metro span, the Mirpur 10 -> Mirpur 1 road, and the
Mirpur 10 -> Kachukhet road, matching the brief's "expect roughly
23.795-23.860 / 90.345-90.395" estimate.

## 3. Download

`curl --data-binary @data/query-north.overpassql
https://overpass-api.de/api/interpreter -o data/north.osm.json`. Succeeded
on the first attempt (no band-splitting needed), ~56 s wall time.

- **Size:** 61,146,825 bytes (61.1 MB), vs. the original `data/mirpur.osm.json`'s
  ~10 MB — about 6x larger, consistent with the ~12x larger bbox area (a lot
  of the extra bbox area, e.g. north of Pallabi, is lower density than the
  original tight Mirpur 10/11 extract).
- **Elements:** 531,279 total = 436,772 nodes, 94,459 ways, 48 relations.

`data/mirpur.osm.json` was not touched.

## 4. `tools/build-scene.mjs` extension

New CLI flags (all optional, all default to the exact old single-corridor
Mirpur-10/Mirpur-11 behaviour):

- `--in <file>` / `--out <file>` — override the default
  `data/mirpur.osm.json` / `public/scene.json` paths.
- `--origin auto` — accepted but a no-op: the projection origin always stays
  `LAT0/LON0 = (23.8137, 90.3668)` per the brief ("do NOT recentre" so the
  existing station coordinates baked into `src/` stay valid). The flag exists
  only so the north build command documents the intent.
- `--metro-start <name>` / `--metro-end <name>` — station names (English)
  that bound the metro clip (default `"Mirpur 10"` / `"Mirpur 11"`, i.e. the
  old hardcoded pair).
- `--stations <a,b,c,...>` — whitelist of station names to keep in
  `metro.stations` and to use for the metro clip range. Omitted = legacy
  behaviour (every `railway=station|stop` node in the extract). Needed for
  the north build because the wider bbox also contains heavy-rail stations
  (Dhaka Cantonment, Airport, Banani) and other MRT stations south of
  Mirpur 10 (Kazipara, Shewrapara) that must not pull the clip range past
  the corridor endpoints.
- `--extra-corridors <a,b>` — extra named arterial-road corridors (besides
  the metro) folded into the same playable-radius cull, by key into the new
  `CORRIDOR_WAY_IDS` table in the script. Omitted = legacy single-corridor
  (metro-only) behaviour.

Internally, `distToMetro` was generalised to `distToCorridor` (kept as a
`distToMetro` alias so the rest of the file and DATA-CULL.md's references
stay valid): it now measures distance to the nearest segment across a single
combined grid of metro-clip segments **plus** any `--extra-corridors` way
segments, instead of metro-only. The metro-clip algorithm itself
(`clipTrackToCorridor`, cumulative arc length + nearest-vertex-to-station)
is unchanged except it now clips between `--metro-start`/`--metro-end` by
name (found in the whitelisted `stations` list) instead of always Mirpur
10/11.

### Backward-compatibility check

Ran `node tools/build-scene.mjs` with **no flags** against the untouched
`data/mirpur.osm.json` and diffed the result against a backup of the live
`public/scene.json` (`meta.generated` timestamp aside): byte-identical
`buildings`/`roads`/`metro`/`areas`/`waterways`/`pois`/`signals` arrays and
identical counts (14453 buildings, 436 roads, 24 areas, 1719 pois). The only
diff was three new metadata fields added to `meta.playable`
(`metroStart`/`metroEnd`/`extraCorridors`), which are additive and don't
change any existing field. `public/scene.json` was then restored from the
pre-test backup byte-for-byte (`md5` verified) before touching anything
else, so no other executor's in-progress work on that file was disturbed.

## 5. Arterial corridors used (way ids, verified against `data/north.osm.json`)

Found by grepping all `highway` ways in the north dump for names matching
`Mirpur`/`Begum Rokeya`/`Kachukhet`/etc., then tracing which ones actually
form a connected chain from the Mirpur 10 circle outward (shared/adjacent
endpoints), read via each way's first/last node lat/lon.

**West arm — Mirpur 10 -> Mirpur 2 -> Mirpur 1 (Gol Chattar):**

| way id     | name (as tagged)        | highway |
|-----------:|--------------------------|---------|
| 155988492  | Main Road                | primary |
| 349875111  | Main Road                | primary |
| 344960257  | Mirpur 10 Road           | primary |
| 349875112  | Mirpur 10 Road           | primary |
| 700096555  | Mirpur 10 Road           | primary |
| 344960258  | Mirpur 10 Road           | primary |
| 349876983  | Mirpur 10 Road           | primary |
| 24402401   | Mirpur 2 Road (spur)     | tertiary|
| 1300893956 | মিরপুর ১ গোল চত্বর (Mirpur 1 Gol Chattar) | primary |

**East arm — Mirpur 10 -> Mirpur 13 -> Mirpur 14 -> Kachukhet:**

| way id    | name (as tagged)         | highway |
|----------:|----------------------------|---------|
| 677364481 | Mirpur Road -13            | primary |
| 19978190  | মিরপুর রোড-১৩               | primary |
| 344957948 | মিরপুর রোড-১৪               | primary |
| 344958165 | Mirpur road-14              | primary |
| 700081596 | Mirpur Road No.14           | primary |
| 450729242 | Mirpur Road No.14           | primary |
| 19977903  | Mirpur Road No.14           | primary |
| 1219669566| Mirpur Road No.14           | primary |
| 677364030 | মিরপুর ১৪ (long parallel carriageway, same route) | primary |

Both chains were verified by walking each way's endpoint coordinates and
confirming they connect end-to-end (within a few metres) from the Mirpur 10
circle out to the Mirpur 1 roundabout / the Kachukhet bus stop area
respectively. Some pairs are duplicate/dual-carriageway segments (e.g. the
two "Main Road" ways, or the parallel "মিরপুর ১৪" alongside the
13/14-named chain) — both are included since redundant corridor segments
don't affect correctness, only add a few extra entries to the corridor grid.

`Begum Rokeya Sharani` (18 ways in the dump) was deliberately **not**
included: it runs south from Mirpur 10 toward Kazipara/Shewrapara, which the
owner explicitly excluded ("don't add Kazipara/Shewrapara",
docs/DECISION-PLAYABLE-AREA.md 17:55).

## 6. Build command used

```
node tools/build-scene.mjs \
  --in data/north.osm.json \
  --out public/scene-north.json \
  --origin auto \
  --metro-start "Mirpur 10" \
  --metro-end "Uttara South" \
  --stations "Mirpur 10,Mirpur 11,Pallabi,Uttara South" \
  --extra-corridors west,east \
  --radius 400
```

(The console output below predates the road-frontage cull added on
2026-09-07 — the same command now also runs Pass 6b and ends at 30,333
buildings / 4.38 MB. See docs/ROAD-FRONTAGE-CULL.md.)

Console output:

```
Reading data/north.osm.json
  436746 nodes, 94454 ways, 48 relations
  roads: 5015 (4221 arterial segments)
  buildings: 87698 (skipped 941) heights: 32 tagged, 1305 from levels, 86361 inferred
  metro: 4 viaduct tracks, 4 stations
  extra corridors: west, east (18 ways, ids: 155988492,349875111,344960257,349875112,700096555,344960258,349876983,24402401,1300893956,677364481,19978190,344957948,344958165,700081596,450729242,19977903,1219669566,677364030)
  ground: 500 areas, 47 waterways
  pois: 4439, traffic signals: 0

Culling to playable radius 400 m (keep radius 1000 m)...
  buildings: 87698 -> 55091 (34390 tagged far:1)
  roads:     5015 -> 1545
  areas:     500 -> 208
  waterways: 47 -> 27
  pois:      4439 -> 3401
  signals:   0 -> 0

Wrote public/scene-north.json
  7.46 MB
  extent 5243 m east-west x 7541 m north-south
  station: Mirpur 10 at (148.83, 593.9)
  station: Pallabi at (-266.19, -1386.76)
  station: Uttara South at (-371.46, -3584.99)
  station: Mirpur 11 at (-154.71, -600.67)
```

## 7. Verification (no browser needed)

```js
node -e "
const fs = require('fs');
const s = JSON.parse(fs.readFileSync('public/scene-north.json','utf8'));
...
"
```

Output:

- **buildings:** 55,091 total, 34,390 tagged `far: 1`
- **roads:** 1,545
- **areas:** 208, **waterways:** 27, **pois:** 3,401
- **stations** (name, x, z metres):
  - Mirpur 10: (148.83, 593.9)
  - Mirpur 11: (-154.71, -600.67)
  - Pallabi: (-266.19, -1386.76)
  - Uttara South: (-371.46, -3584.99)
- **bounding box (metres):** minX -2347.2, maxX 2896.0, minZ -4534.8,
  maxZ 3006.4 -> extent 5243 m east-west x 7541 m north-south.
- **Sanity check:** Uttara South is 4,179 m north (negative z) of Mirpur 10
  — within the brief's expected 4-5 km. (Mirpur 1 Gol Chattar, projected by
  hand from its raw lat/lon since it's not a metro station: x ≈ -1181 m,
  about 1.3 km west of the origin / ~1.33 km west of Mirpur 10 station —
  same order of magnitude as the brief's "~2 km west" estimate, correct
  sign.)
- `JSON.parse` on the full file succeeds (valid JSON), file size on disk
  7,472,900 bytes (7.46 MB).

## Not done / follow-ups

- No browser verification was attempted or needed — the brief says "no
  browser tab is needed" for this executor, and P2-STREAMING (referenced in
  docs/DECISION-PLAYABLE-AREA.md) still needs to land in `src/` before
  `scene-north.json` can actually be loaded by the running game; that is
  explicitly out of scope for this data-only pass.
- `public/scene-north.json` is a new, unreferenced file — nothing in `src/`
  loads it yet. `public/scene.json` (the file the live game currently
  fetches) was left exactly as found.
- The `far: 1` tagging and 400 m/1000 m radius numbers reuse the same
  playable-radius policy as `docs/DATA-CULL.md`; no new policy decision was
  made here.
- Did not touch any file under `src/`. Did not run `git commit`.
