# Mirpur 12 / Pallabi street-level observations (REFERENCE ONLY)

Executor P8-MIRPUR12, 2026-09-07. Source: Mapillary street-level imagery,
CC-BY-SA per-image (Mapillary contributors), viewed live in the browser at
https://www.mapillary.com/app/?lat=23.8262&lng=90.3642&z=16 (advisor's link
from docs/MIRPUR12-RESEARCH.md). Per reference/README.md and
reference/metro/photos/CREDITS.md convention: REFERENCE ONLY, never shipped
in the build, credited to the photographer/platform, not redrawn 1:1.

## Coverage confirmed
The map view at z=16-18 shows dense green sequence lines running along
every road in the Mirpur 12 block grid, matching MIRPUR12-RESEARCH.md's
claim. Numbered roads are directly labelled on the Mapillary basemap:
ROAD 3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15/16, 17/18 all visible with their
own sequences, confirming the "numbered roads inside blocks" street
grammar the advisor already identified from OSM.

## Observation 1 — under the Mirpur flyover, near ROAD 6/14 junction
Source: image by Mapillary contributor "Shafayat_808", captured 2025-12-09.
Direct link (pKey): https://www.mapillary.com/app/?pKey=1495322155103913
Location: approx. 23.8269, 90.3644 (Sharani / Road 6-14 junction, next to
Bangladesh Maritime University, ~200 m from Pallabi station).
- The road runs straight under a concrete flyover/box-girder structure;
  rectangular concrete piers on both sides of a single carriageway, spaced
  roughly every 25-30 m, similar in scale to the metro viaduct piers this
  repo already models for Mirpur 10/11.
- Ground floor buildings flush to the road on both sides, 4-6 storeys,
  render in dusty red/salmon and off-white, consistent with the
  WALL_PALETTE already in facades.js.
- Heavy poster/hoarding clutter plastered directly onto the pier faces and
  low walls beside the footpath (movie posters, ads) — a texture detail not
  currently modelled, noted for future passes but out of scope for this
  file-fenced pass (facades.js/signs.js only, no new geometry).
- Foot traffic: cycle rickshaws (at least 6 visible, parked and moving),
  pedestrians walking in the road itself (no continuous kerb-separated
  footpath under the flyover span), a motorbike, a green covered rickshaw
  stand/shelter with a blue-green tarpaulin roof on the left foreground —
  matches OWNER-PHOTOS-2026-09-07's "hawker stalls under blue tarpaulins"
  and "rickshaws parked on the footpath" notes for the corridor.
- Lighting: sodium/warm street lighting under the flyover deck even in
  daylight (the deck blocks the sky), giving the underpass a dim, hazy look
  with a bright exit at the far end — confirms city.js's implied dense/tall
  massing right up to major roads.

## Observation 2 — map overview, Mirpur 12 block grid
Source: Mapillary basemap at z~18, same session, centred near
23.8262, 90.3642 (Pallabi / edge of Mirpur 12).
- Numbered roads ROAD 6 through ROAD 10, ROAD 13/14, ROAD 15/16, ROAD 17/18
  run as a near-parallel grid east of the main Mirpur-Mymensingh corridor,
  each with its own dense Mapillary sequence (near-continuous green dotted
  lines), confirming these interior roads have real photographic ground
  truth available, not just the arterial.
- Small, tightly packed plot outlines are visible at this zoom (consistent
  with the 126 m2 median footprint / ~11 m frontage figure in
  MIRPUR12-RESEARCH.md) — no visible large-footprint towers inside the
  numbered-road blocks; the bigger footprints sit only on the arterial.
- A named green space ("MAWTS Institute of Technology" campus block, plus
  the Bangladesh Maritime University campus) breaks up the grid with larger
  low-density plots, distinct from the small residential/commercial blocks
  around it — this matches the "Mirpur 12 Block C Park" style break in the
  fine grid the advisor's OSM extract already found.

## What I could NOT verify directly
The Browser pane went to a "not displayed / not compositing" state partway
through this pass (a display-visibility issue in this environment, not a
site limitation) and would not return, so I could not click through
additional sequences to get dedicated close-up views of (a) a shopfront
signboard band at eye level, (b) a residential numbered-road facade with
balconies, or (c) the arterial vs numbered-road contrast side by side, and
could not reliably persist Mapillary's WebGL viewer canvas to a JPEG file
(the canvas clears its drawing buffer between tool round-trips because it
is not using `preserveDrawingBuffer`, so `toDataURL` reads back a blank
frame even though the same frame is visible on screen a moment earlier —
confirmed by three separate capture attempts, all producing a black/blank
JPEG despite the live screenshot showing full street detail).
Given this, `reference/mirpur12/refonly/` below holds what could be
captured; the two observations above are honest, directly-viewed evidence,
and the rest of this pass leans on the advisor's already-thorough
MIRPUR12-RESEARCH.md (OSM-derived, quantitative) and
reference/metro/OWNER-PHOTOS-2026-09-07.md (owner's own corridor photos,
which explicitly apply to the whole corridor including Mirpur 12) rather
than inventing detail Mapillary could not confirm.

## Net takeaways applied to facades.js / signs.js
1. Confirmed: flush-to-street 4-6 storey walls, dusty red/salmon and
   off-white renders, exactly the palette already in WALL_PALETTE.
2. Confirmed: rickshaws and tarpaulin-roofed stalls at street level
   (out of file-fence scope to add geometry, noted only).
3. Confirmed: the numbered-road grid is a real, photographically-documented
   pattern distinct from the arterial — supports treating ground-floor
   commercial signage as an arterial-frontage feature (as signs.js already
   does via the road-rank frontage test) while keeping numbered-road
   facades slightly less signage-dense.
