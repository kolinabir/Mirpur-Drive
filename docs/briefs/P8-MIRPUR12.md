# P8-MIRPUR12: start the player at Mirpur 12, and make it feel real

Owner files: `src/facades.js`, `src/signs.js` ONLY for the look; plus
`reference/mirpur12/` (new folder) for research notes. The start position
lives in `src/main.js` — main.js is the ADVISOR'S; write the exact spawn
coordinates and yaw you want into `docs/MIRPUR12-PASS.md` and the advisor
will wire them, OR ask in the doc and the advisor will hand you main.js.
Docs: write `docs/MIRPUR12-PASS.md`. Screenshots: `screenshots/p8-m12-*.jpg`.

Read first, in full:
1. `docs/briefs/P0-COMMON.md`
2. **`docs/MIRPUR12-RESEARCH.md`** — the advisor has ALREADY located
   Mirpur 12 in scene coordinates, profiled its 1,772 buildings, counted
   its POIs and confirmed Mapillary coverage. START THERE; do not redo it.
3. `reference/metro/OWNER-PHOTOS-2026-09-07.md` (street observations apply
   to the whole corridor)
4. `src/facades.js` (the procedural facade atlas) and `src/signs.js` (the
   Bangla shop signage)

## The owner's ask
"suppose the player starts from mirpur 12! ... we need to configure the
builds with real structure and real alike feel! ... check street view
images too!"

Mirpur 12 is ALREADY inside the shipped map — Pallabi metro station sits at
scene **(-266, -1377)** and the Mirpur 12 bus stand at **(-275, -1616)**.
So this is a start-position and dressing job, NOT a new data build. Do not
touch tools/build-scene.mjs or the scene JSON.

## 1. Research pass (do this first, write it down as you go)
Mapillary has dense street-level coverage of the Mirpur 12 block grid:
https://www.mapillary.com/app/?lat=23.8262&lng=90.3642&z=16
Wait ~15 s for tiles, zoom to z>=18 before clicking a sequence or the click
misses the line. Imagery is CC-BY-SA — REFERENCE ONLY, never shipped; write
credits the way `reference/metro/photos/CREDITS.md` does.
Look at, and write down in `reference/mirpur12/OBSERVATIONS.md`, with a
source link per observation:
- ground-floor shopfront rhythm: shutter width, signboard height/colour,
  how far signs project over the footpath
- facade materials: exposed brick vs render vs tile, staining, AC units,
  balcony grille patterns, window proportions and spacing
- roofline: water tanks, stair-head boxes, parapet type, antennas
- the street itself: footpath width and material, kerbs, rickshaw parking,
  hawker stalls, poles and the cable mess
- what a Mirpur 12 numbered road (ROAD 6/7/8) looks like vs the arterial
Take at least 6 screenshots of reference views into
`reference/mirpur12/refonly/` and describe each honestly.

## 2. Make the buildings read as Mirpur 12
The data already says what the massing is (from MIRPUR12-RESEARCH.md):
median footprint **126 m2** (~11 m frontage), storeys peaking at **5-8**,
tallest ~34.6 m, flush to the street. The MASSING IS ALREADY RIGHT. What is
missing is surface truth. In `facades.js`:
- Ground floor must differ from upper floors on through-roads: roller
  shutters, a signboard band, a raised plinth — not the same window grid
  repeated from pavement to roof.
- Upper floors: balconies with steel grilles, AC boxes, laundry, window
  proportions taken from the reference, not invented.
- Materials: exposed brick and stained render dominant, tile and paint
  rarer. Vary per building so a street is not a repeating texture.
- Keep it in the atlas approach that facades.js already uses; do NOT add
  per-building unique textures (memory) and do NOT increase draw calls.

## 3. Make the signage read as Mirpur 12
The POI counts from the OSM extract within 500 m of Pallabi are the brief:
**55 pharmacies, 40 schools/madrasas, 40 bKash/telecom money-transfer
booths**, 25 clinics/dental chambers, 12 restaurants, 8 coaching centres,
9 ATMs, 5 banks. That repetition IS the neighbourhood.
In `signs.js`, weight the generated shop signs to that real distribution —
pharmacy greens with a cross, bKash/Nagad pink and orange telecom booths,
coaching-centre boards, dental chambers, tailors, tea stalls — in Bangla
with the English underline the way the real boards do it. Today's signage
is generic; this is likely the cheapest big win for authenticity.
Do not reproduce real brand logos in detail; suggest the palette and
layout, do not clone trade dress.

## 4. Propose the spawn
Pick a spawn that shows Mirpur 12 at its best on load: on the footpath near
Pallabi station or the Mirpur 12 bus stand, looking down a street wall, the
viaduct visible. Write the exact `x, z, yaw` into docs/MIRPUR12-PASS.md
with a screenshot of what the player would see, and say why. The advisor
wires it into main.js.

## Fences and hazards
Do NOT touch src/main.js, src/city.js, src/traffic.js, src/player.js,
src/drive.js, src/models.js, src/metro.js, src/interior.js, src/walkable.js,
src/minimap.js, index.html, tools/build-scene.mjs or public/scene*.json.
Another session has been editing this repo concurrently — RE-READ any file
immediately before you edit it, and re-check the scene counts rather than
trusting a number quoted in an older doc.

## Verification
Dev server is ALREADY RUNNING at http://localhost:5183 — do not start or
kill one. North scene is the default. Enter the street at [399,318] in an
800x450 frame, then reach Mirpur 12 with quick travel key **5** (Pallabi).
Hidden-pane rule: after moving call `window.__mirpur.player.update(0)` then
`window.__mirpur.capture()`.
Screenshots, distinct md5s, each read back with the Read tool:
- `p8-m12-street.jpg`    — a Mirpur 12 residential road, street wall
- `p8-m12-shopfront.jpg` — ground-floor shopfronts and signage close up
- `p8-m12-spawn.jpg`     — exactly what the player sees on spawn
- `p8-m12-compare.jpg`   — the same view before your changes, for contrast
Record HUD draws/triangles/fps before and after; the facade and signage
work must not raise draw calls. Write docs/MIRPUR12-PASS.md AS YOU GO.
Take your own tab with tabs_create, close it with tabs_close when done.
Do not spawn sub-agents. Do not run git commands. Never claim a look you
did not see rendered.

---

## OWNER STREET VIEW ADDED 18:15 — READ THIS, IT OVERRIDES SECTIONS 2 AND 3

The owner sent two Google Street View screenshots plus links of the EXACT
spawn area (Begum Rokeya Ave / Mirpur Ceramic Rd between Pallabi station
and the Mirpur 12 bus stand) and said "was talking about this areas".
Transcribed in **reference/mirpur12/OWNER-STREETVIEW-2026-09-07.md** —
read it in full before touching facades.js or signs.js. It has the same
authority for Pallabi/Mirpur 12 that OWNER-PHOTOS has for Mirpur 10.

The two corrections that change YOUR work:

**A. There are TWO signage grammars here, and we apply one everywhere.**
- The ARTERIAL frontage (Begum Rokeya Ave, the spawn street) carries big
  brand signage stacked VERTICALLY up building corners and across upper
  floors — illuminated boxes, large channel letters across a facade top,
  showroom fascias. Not a single ground-floor band.
- The SIDE STREETS keep the pharmacy / bKash / coaching / dental mix from
  docs/MIRPUR12-RESEARCH.md (55 pharmacies, 40 telecom booths per 500 m).
Weight signage by road rank so the arterial and the back-blocks differ.
Suggest palettes and layouts; do NOT clone real trade dress or logos.

**B. The arterial buildings are NOT the brick-and-render stock.**
The frontage here is largely **full-height glazed / mirror-glass curtain
wall**, 5-7 storeys, plus one red-panel-and-glass commercial block — and,
critically, **unfinished concrete frames**: bare slabs and columns with no
infill walls, which are everywhere in Dhaka and entirely absent from our
city. Add a glass-curtain-wall facade type and an unfinished-frame type in
facades.js, weighted onto arterial frontage; keep brick/render for the
back-blocks. Stay in the atlas approach — no new draw calls.

Items in that file about the viaduct pier flare, precast girder joints,
under-deck conduits, the green-roof footbridge, the striped median kerb,
guard railings and median saplings are NOT yours — they belong to
metro.js and streets.js. Do not implement them; the advisor is routing
them to those briefs.
