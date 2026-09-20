# Mirpur 12 / Pallabi: ground truth for the new start area
Advisor, 2026-09-07. Owner ask: "suppose the player starts from mirpur 12!
check mirpur 12 location find images! we need to configure the builds with
real structure and real alike feel!"

Everything below was measured from this repo's own OSM extract
(`data/north.osm.json`, 58 MB) and `public/scene-north.json`, or seen in a
browser. It is ground truth, not recollection.

## 1. Where Mirpur 12 is, in OUR coordinates
Scene origin is lat 23.8137, lon 90.3668; +X east, +Z south, metres.

| Feature | Real lat/lon | Scene x, z |
|---|---|---|
| **Pallabi metro station** (মেট্রো স্টেশন) | 23.82616, 90.36419 | **-266, -1377** |
| Pallabi Bus Station (the "Mirpur 12 bus stand") | 23.82832, 90.36410 | **-275, -1616** |
| The City Bank, Pallabi branch | 23.82477, 90.36460 | -224, -1224 |
| Agrani Bank, Pallabi branch | 23.82803, 90.36440 | -244, -1584 |
| Pallabi Nursing Institute | 23.82797, 90.36284 | -404, -1578 |
| Pallabi Degree College | 23.82715, 90.35726 | -972, -1487 |

`scene-north.json` already lists the station at (-266.2, -1386.8), so the
data agrees to ~10 m. **Mirpur 12 is already inside the shipped map** —
this is a start-position and dressing job, not a new data build.
Bounds are minX -2347, maxX 2896, minZ -4535, maxZ 2999, so there is room.

## 2. What the area actually is, from the data
1,772 buildings lie within 450 m of Pallabi station.

- **Storeys** (height/3, so approximate): 1 -> 151, 3 -> 111, 4 -> 159,
  **5 -> 304, 6 -> 419, 7 -> 317**, 8 -> 212, 10 -> 67, 11 -> 15, 12 -> 2.
  So the signature is a **solid 5-8 storey wall**, not towers and not
  shanties. The tallest thing in the area is ~34.6 m.
- **Footprints**: median **126 m2**, p90 280 m2, max 5,481 m2. These are
  small plot-built apartment blocks packed shoulder to shoulder — roughly
  11 x 11 m each. That is the single most important structural fact for
  "real feel": narrow frontages, many of them, flush to the street.
- **Roads** touching the area by rank: 88 at rank 2 (residential), 11 at
  rank 3, 4 at rank 4 (arterial). It is overwhelmingly a fine residential
  grid hanging off one arterial.
- Mirpur 12 is laid out in **BLOCKS with numbered roads** — the OSM data
  and the Mapillary basemap show "ROAD 6", "ROAD 7", "ROAD 8" etc. running
  parallel, and the extract contains a way named "Mirpur 12 Block C Park".
  Blocks A-E with numbered roads inside them is the real street grammar.

## 3. The commercial signature (this is what makes it FEEL like Mirpur)
Named POIs within 500 m of Pallabi station, counted from the OSM extract:

| Type | Count | Examples |
|---|---:|---|
| **pharmacy** | **55** | Al Amin Medicine Corner, Al Mokka Pharmacy |
| **school / madrasa** | 40 | Mother Teresa Catholic School, Academia, আল হিকমাহ হিফজ মাদ্রাসা |
| **money_transfer (bKash/telecom)** | 40 | Binimoy Telecom, Amin Communication |
| restaurant | 12 | Mogol Party Centre, Pizza Hut, California Fried Chicken |
| ATM | 9 | Dutch-Bangla, UCB |
| clinic / hospital / dentist | 25 | Rabeya Maternity, Monoara Dental Care |
| coaching centre ("training") | 8 | Pallabi Academic Coaching, Metaphor Academic Care |
| bank | 5 | City Bank, Agrani Bank |
| marketplace | 1 | Rangdhonu Shopping Complex |
| bus station | 1 | Pallabi Bus Station |

**55 pharmacies and 40 mobile-money/telecom shops in a 500 m circle.** That
is the real ground-floor mix of this neighbourhood: pharmacy, bKash/telecom
booth, coaching centre, dental chamber, tailor, tea stall — repeated
endlessly. Our current generic Bangla shop signage does not reflect it, and
fixing that is probably the cheapest big win for authenticity.

## 4. Street-level imagery EXISTS for Mirpur 12
**Mapillary has dense coverage of Mirpur 12 and Pallabi** — verified in the
browser at https://www.mapillary.com/app/?lat=23.8262&lng=90.3642&z=16 :
photo sequences run along virtually every street in the block grid,
including the numbered roads inside Mirpur 12. Imagery is CC-BY-SA, so it
is usable as REFERENCE (this repo already keeps reference-only material out
of the shipped build — see reference/README.md).
Notes for whoever mines it:
- The web viewer needs a moment to load tiles and renders blank at first;
  wait ~15 s before screenshotting, and zoom to z>=18 before trying to
  click a sequence, or the click misses the line.
- Mapillary's Graph API needs a free access token for programmatic pulls.
  Ask the owner for one if bulk download is wanted; the viewer alone is
  enough for visual reference.
- Google Street View: a bare `/maps/@lat,lon,3a,...` URL with an empty
  panoid falls back to the world map. Search the place first, or use
  Mapillary, which is better licensed for this purpose anyway.

## 5. What "real feel" means here, concretely
Derived from the numbers above plus reference/metro/OWNER-PHOTOS-2026-09-07.md
(whose street observations apply to the whole corridor):
1. Narrow frontages: ~11 m median, flush to the footpath, no setbacks.
2. A continuous 5-8 storey street wall, with occasional 10-12 storey.
3. Ground floor is ALWAYS commercial on the through-roads: shutters,
   projecting signboards, pharmacy greens and bKash pinks.
4. Exposed brick and stained render, not clean paint. Rooftop water tanks
   and stair-head boxes on nearly every roof (city.js already does tanks).
5. Balconies with steel grilles on every upper floor, laundry, AC boxes.
6. Rickshaws parked on the footpath; hawkers under blue tarpaulins.
7. Numbered-road grid with block parks (e.g. Mirpur 12 Block C Park).

---

## LIVE CHECK AT THE PROPOSED SPAWN, advisor 18:20 — one real bug found

Teleported to (-262, -1466), the Begum Rokeya Ave spot from the owner's
first Street View, and watched what the player would actually see.

**Result: it works, and it looks like Mirpur.** 60 fps, 194 draws,
645k tris. A continuous 5-7 storey street wall on both sides, shopfronts
with coloured signage at ground level, the viaduct running down the middle
on its piers, footpaths and poles. Third person is live too — the avatar
from the P5-TPS pass renders correctly on the footpath.

**BUG: you arrive into an empty desert and wait ~10 seconds.**
Immediately after arriving, the area is bare ground + roads + viaduct with
ZERO buildings; the minimap shows the full block grid while the 3D world is
empty. Tiles then stream in over roughly ten seconds and the street wall
appears. `updateBuildingLOD` builds ONE tile per call, so a fresh area
needs tens of frames to fill.

That is tolerable for a mid-game teleport. It is NOT acceptable for a
SPAWN: if the player starts at Mirpur 12, the first thing they see is an
empty plain, which reads as a broken game.

**Fix (main.js, plus possibly city.js): pre-warm the spawn.** Before the
start card is dismissed, call `updateBuildingLOD(spawnX, spawnZ)` in a loop
(or add a `warmTiles(x, z, radius)` to city.js that builds every tile
within the build radius synchronously) while the loading progress bar is
still on screen. The loader already yields with setTimeout, so this can be
folded into the existing progress steps without freezing the page.
The same pre-warm should run on quick travel (keys 1/2/5/6), which has the
identical problem.

Assign to whoever owns main.js and city.js — at the time of writing that is
the P7-COLLISION executor.
