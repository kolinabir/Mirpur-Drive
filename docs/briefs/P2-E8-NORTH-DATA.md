# P2-E8: download and build the expanded map (Mirpur 10 to Uttara South)

Owner files: `data/query-north.overpassql` (new), `data/north.osm.json`
(new download), `tools/build-scene.mjs` (extend, keep the old behaviour
as default), `public/scene-north.json` (NEW output; do NOT overwrite
public/scene.json). Docs: `docs/NORTH-DATA.md` (create). No src/ edits.
Read: docs/briefs/P0-COMMON.md, docs/DECISION-PLAYABLE-AREA.md (both
decisions), docs/DATA-CULL.md, tools/build-scene.mjs, data/query.overpassql.

## 1. Find the extent
Query Overpass for Line 6 stations first:
  node["railway"="station"]["name"~"Mirpur 10|Mirpur 11|Pallabi|Uttara South|Uttara Dakshin"](23.78,90.33,23.88,90.42);
Note each lat/lon. Also locate Mirpur 1 bus stand / Mirpur 1 roundabout,
Mirpur 2 (Sony junction), and Kachukhet / Mirpur 14 via
node["name"~...] or by the arterial ways' names. Write the coordinates
into docs/NORTH-DATA.md.
Bounding box = 500 m margin around: the metro from Mirpur 10 to Uttara
South, the road Mirpur 10 -> Mirpur 1, the road Mirpur 10 -> Kachukhet.
Expect roughly lat 23.795-23.860, lon 90.345-90.395; use what you find.

## 2. Download
Copy data/query.overpassql to data/query-north.overpassql with the new
bbox, run it against https://overpass-api.de/api/interpreter (curl --data-binary
@file, timeout 300; if it times out, split the bbox into 2-3 latitude
bands and concatenate the element arrays). Save data/north.osm.json.
Record size and element counts. Keep data/mirpur.osm.json untouched.

## 3. Build
Extend build-scene.mjs with `--in <file> --out <file> --origin auto`:
- origin: keep LAT0/LON0 = the current values (23.8137, 90.3668) so the
  existing station coordinates stay valid; do NOT recentre.
- Playable corridors: instead of "distance to the metro clipped between
  two stations", accept a list of polylines: the metro from Mirpur 10 to
  Uttara South (clip between those two stations by name), plus the two
  arterial road chains found by name (primary/secondary highways whose
  name matches "Mirpur"/"Begum Rokeya"/"Kachukhet"/"Mirpur 1"... verify by
  inspecting names in the dump and list the way ids you used in the doc).
  400 m band, 1000 m keep radius, same `far` tagging.
- All four stations must appear in `metro.stations` with name/x/z.
- Output public/scene-north.json. Print counts. Do not touch
  public/scene.json.
## 4. Verify (no browser needed)
node -e: parse scene-north.json; print buildings / far / roads / stations
(name,x,z) and the bounding box in metres. Sanity: Uttara South must be
~4-5 km north (negative z) of Mirpur 10; Mirpur 1 ~2 km west (negative x).
