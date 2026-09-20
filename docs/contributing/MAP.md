# Map & data contributions

Roads, building footprints, the metro alignment and station positions all
come from **OpenStreetMap**. The game never reads OSM directly; it reads
pre-built scene files:

| File | What it is | Built by |
|---|---|---|
| `public/scene-north.json` | Default district: Pallabi, Mirpur 11, Mirpur 10, Uttara South + west/east arms | `tools/build-scene.mjs` |
| `public/scene-bijoy.json` | Agargaon, Bijoy Sarani, Farmgate, Manik Mia Avenue / Sangsad | `npm run data:bijoy` |
| `public/scene.json` | The original small Mirpur 10–11 map | `npm run data` |
| `public/map-overview.json` | Whole-corridor summary for the full map | `node tools/build-overview.mjs` |
| `public/street-pallabi.json` | 28 real frontage footprints on the Pallabi stretch | hand-curated, see `src/landmarks.js` |

## The best map fix is an OpenStreetMap fix

If a road is missing, a building has the wrong shape, or a shop isn't
mapped, **fix it on [openstreetmap.org](https://www.openstreetmap.org)
first.** Everyone benefits, and the change flows into the game the next time
the data is rebuilt. Useful tags this project reads:

- `building:levels` / `height` — the single most valuable tag. It is also the
  ground truth the height estimator is calibrated against
  (`tools/calibrate-heights.mjs`).
- `highway=*`, `lanes`, `oneway` — road class drives road width and traffic.
- `name`, `shop=*`, `amenity=*` — drives the signage mix (pharmacy green,
  bKash pink, telecom orange…) along each street.

Only map what you have seen yourself or can see in imagery OSM permits.
Never copy from Google Maps into OSM.

## Rebuilding the scene files

The raw OSM dumps are not committed (~70 MB, fully regenerable).

1. Run the matching query in `data/query*.overpassql` at
   [overpass-turbo.eu](https://overpass-turbo.eu) (or the Overpass API) and
   save the JSON as `data/mirpur.osm.json`, `data/north.osm.json` or
   `data/bijoy.osm.json`.
2. Optional, for measured building heights:
   `node tools/fetch-heights.mjs --in data/north.osm.json --out data/heights-north.json`
3. Build, e.g. `npm run data:bijoy`, or for another extract pass
   `--in`, `--out`, `--stations`, `--metro-start`, `--metro-end`,
   `--extra-corridors`, `--radius` and `--heights` to `tools/build-scene.mjs`
   (the flags and their defaults are at the top of that file).
4. `node tools/build-overview.mjs` if stations, arterials or water changed.
5. Walk and drive the affected area in-game, in daylight and at night.

Put the exact commands in your PR. Scene JSON diffs are unreadable, so the
reviewer relies on your description and screenshots.

## Adding a new area or district

Districts are declared in `src/districts.js` (scene file, stations, spawn,
quick-travel slots, named destinations, and how districts connect by metro).
A new district needs: an Overpass query in `data/`, a scene file, a
`districts.js` entry, and a rebuilt `map-overview.json`. Open an issue first
— the playable band (400 m either side of the corridors, see
`docs/DECISION-PLAYABLE-AREA.md`) and the streaming budget
(`docs/STREAMING.md`) constrain how much can be added at once.

## Fixing something the data can't express

Some things are corrected in code rather than in OSM: buildings clipped back
from the road edge, footprints excluded because a hand-modelled landmark
replaces them, platform heights, entrance positions. Search
`tools/build-scene.mjs` and `src/city.js` for the area you are touching, and
read the matching note in `docs/` (`ROAD-FRONTAGE-CULL.md`, `DATA-CULL.md`,
`PLATFORM-HEIGHT.md`) before adding another special case.

## Licence

Map data is © OpenStreetMap contributors under the
[ODbL](https://opendatacommons.org/licenses/odbl/). Building heights come
from Google's Open Buildings 2.5D Temporal dataset (CC-BY-4.0). Do not mix in
data from sources that are not compatible with those.
