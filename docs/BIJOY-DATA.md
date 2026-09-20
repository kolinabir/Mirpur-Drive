# P12 — Bijoy Sarani district: the data

Built 2026-09-08. Advisor (Opus) produced the data and the two new modules;
the wiring was handed to Sonnet executors (docs/briefs/P12-*).

## Why a second scene at all

Everything is projected into ONE metric frame (origin lat 23.8137, lon
90.3668, +X east, +Z south), so these coordinates are directly comparable
with the Mirpur ones:

| Place | world (x, z) | from Mirpur 10 |
|---|---|---|
| Mirpur 10 station | (149, 594) | — |
| Uttara South | (-371, -3585) | 4.2 km north |
| Agargaon station | (1349, 3927) | 3.4 km south |
| Bijoy Sarani station | (1660, 5266) | **5.3 km south** |
| Jatiya Sangsad Bhaban | (1192, 5745) | 5.8 km south |
| Farmgate station | (2069, 6085) | 6.1 km south |

`scene-north.json` is already 30,333 buildings / 4.5 MB after a 400 m
corridor cull and takes ~20 s to build in the browser. Continuing the
corridor south through Kazipara and Shewrapara would roughly double it for a
stretch the player would only ever pass through. So Bijoy Sarani ships as its
own scene and the metro ride between the two is a district swap
(src/districts.js).

## The Overpass extract

`data/query-bijoy.overpassql`, bbox `23.752,90.368,23.784,90.398` — the same
query shape as `query-north.overpassql`. Fetched from
`overpass.kumi.systems` (the main `overpass-api.de` endpoint was returning
"server is probably too busy"). 8.5 MB, 78,971 elements, 11,664 buildings.

Saved as `data/bijoy.osm.json`.

## The build

```bash
node tools/build-scene.mjs \
  --in data/bijoy.osm.json --out public/scene-bijoy.json \
  --stations "Agargaon,Bijoy Sarani,Farmgate" \
  --metro-start "Agargaon" --metro-end "Farmgate" \
  --extra-corridors manikmia,lakeroad,bijoysarani,agargaon
```

Result (before the P13-A heights pass below): **6,280 buildings, 570 roads,
184 areas, 679 POIs, 1.07 MB** — a lighter scene than either existing map.
After adding `--heights data/heights-bijoy.json` (P13-A) the shipped scene
is **5,955 buildings, 570 roads, 184 areas, 679 POIs, 1.03 MB** — measured
heights shift some buildings across the road-frontage culler's height
exemption, which is why the count moved slightly even though nothing else
about the query or culls changed.

### Two changes this needed in `tools/build-scene.mjs`

1. **Four new `CORRIDOR_WAY_IDS` chains.** Sangsad Bhaban sits ~460 m west of
   the MRT alignment on Rokeya Sarani, i.e. just outside the 400 m
   metro-only playable radius — the whole reason for the district would have
   been culled as off-corridor data. `manikmia` (the south frontage, 10
   ways), `lakeroad` (the north side along Crescent Lake), `bijoysarani` and
   `agargaon` bring the complex, its lake and both stations inside the
   playable band. Way ids were read out of the extract, not guessed.
2. **`STATION_RENAME`.** OSM node 10294553601 carries `name:en=Bijoy
   Sarawni` — a transliteration typo upstream. Station names are baked into
   `src/` (signs, the district registry, the ride gate), so the correction
   is applied once, where the tag is read, rather than worked around in each
   consumer.

### Heights

Done (P13-A). `tools/fetch-heights.mjs --in data/bijoy.osm.json --out
data/heights-bijoy.json` was run against the same Google Open Buildings 2.5D
Temporal raster (EPSG:32646, epoch 2023) the Mirpur maps use, then the scene
was rebuilt with `--heights data/heights-bijoy.json` added to the exact
`npm run data:bijoy` invocation above.

Raster fetch: 11,631 footprints reconstructed from the extract; **11,247 got
a raster height (96.7%)**, 384 fell back (360 outside raster coverage, 24
with fewer than 4 valid pixels). 197 COG tiles fetched over the network,
12,895 served from the on-disk cache.

Height-source breakdown from `build-scene.mjs`'s own summary line:

| source | before (`--heights` omitted) | after |
|---|---|---|
| tag | 14 | 14 |
| levels | 300 | 300 |
| raster | 0 | 10,946 |
| inferred | 11,322 | 376 |

(11,636 buildings counted here, before the playable-radius and
road-frontage culls; the shipped scene keeps 5,955 of them, down slightly
from the pre-heights build's 6,280 because a few buildings' raster-measured
height crossed the culler's height-exemption threshold differently than the
guessed height had.)

Spot checks (OSM/relation id: before height guess -> after measured height,
metres):

- **7377704**: 16.35 -> 22.45 (raster p75 19.5 m, n=6,152 px)
- **9716353**: 31.6 -> 7.2 (raster p75 5.5 m, n=5,022 px) — heuristic had
  badly overguessed this one
- **18085267** (National Parliament House relation, main ring): 28.55 ->
  37.7. Its OSM tags carry no `height` or `building:levels` in this extract
  (`building=yes` only), so it now falls to the raster (p75 23 m, n=44,405
  px, the densest sample in the whole extract) instead of the footprint-area
  heuristic.
- **24448507**: 28.55 -> 34.65 (raster p75 25 m, n=62,367 px)
- **223069218**: 34.65 -> 19.4 (raster p75 14.5 m, n=2,665 px)

96.7% raster coverage lands this extract at the same quality bar as the
Mirpur maps; the remaining 376 inferred buildings are the small minority
outside raster coverage or with too few valid pixels, same as Mirpur's own
residual.

## The Parliament footprint is real

OSM relation **18085267** (`name:en=National Parliament House`,
`building:levels=8`, `wikidata=Q497536`, sourced by its mapper from Esri
world imagery) survives the cull and comes through as two rings:

- the ring of nine peripheral blocks: **177 points, 849 m of perimeter,
  150 m x 174 m, 14,336 m^2**, with **14 interior voids** — the light courts
  between the blocks, plus the large central void;
- the **assembly-chamber block inside that void: 947 m^2**, centred
  (1197, 5716).

`src/sangsad.js` reads those rings straight back out of the scene file and
builds on them. What is measured and what is interpreted is listed at the top
of that file — read it before changing anything there.

## Known follow-ups

- Satellite heights are now in place (above); 376 buildings (3.3%) still
  fall back to the footprint-area heuristic where the raster has no
  coverage or too few valid pixels — same residual rate as the Mirpur maps.
- The emitted `metro.tracks` are NOT clipped to the district (Overpass
  returns whole ways), so the viaduct runs from z -3479 to z 9536 — 13 km,
  well past both ends of the playable area. Same behaviour as
  `scene-north.json`; it costs piers and lengthens train headway to ~285 s
  per rail. Clipping the emitted tracks would be a `build-scene.mjs` change
  affecting both maps and was deliberately NOT made in this pass.
