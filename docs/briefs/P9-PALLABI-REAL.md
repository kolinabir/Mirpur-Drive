# P9-PALLABI-REAL: make the owner's Street View spot actually look like itself

Owner files: `src/facades.js`, `src/signs.js`, `src/metro.js` ONLY.
Docs: append to `docs/MIRPUR12-PASS.md`. Screenshots: `screenshots/p9-*.jpg`.

## The one thing that matters
The owner pasted two Google Street View shots of Begum Rokeya Ave /
Mirpur Ceramic Rd between Pallabi station and the Mirpur 12 bus stand and
said: "was talking about this areas... we need to configure the builds with
real structure and real alike feel". Then, twice: "when are u making
mirpur 12 realalike texture and structure? as I said! and gave".

**Read `reference/mirpur12/OWNER-STREETVIEW-2026-09-07.md` FIRST and in
full.** It is the advisor's transcription of those two images and it wins
over every other spec for this area. Then
`docs/MIRPUR12-RESEARCH.md` for the numbers.

**Stand at the spot before you change anything.** Enter the street, then:
`window.__mirpur.player.teleport(-262, -1466, 1.68, 0.25)` — that is the
first Street View position in scene coordinates. **Wait ~12 s after
teleporting**: building tiles stream in one per frame and the area renders
as empty ground until they arrive (known bug, not yours). Screenshot that
view as `p9-before.jpg`. Every change you make is judged against it.

## Already done by the advisor — do NOT redo, DO verify
`pierShaftGeometry` in metro.js has been rebuilt: the pier used to be 15%
WIDER at the base and narrow upward; the real one is narrower at the ground
and flares outward as it rises. It is now a 7-band swept profile, nearly
constant for the lower 42% then smoothstep-flaring into the cap. It parses
but HAS NEVER BEEN SEEN RENDERED. Your first job is to look at a pier from
street level and say honestly whether it now matches the owner's photo. If
the flare is too weak, too strong, or the normals band, fix it.

## Then, in this order (all from the owner's Street View)
1. **Girder segment joints** (metro.js). The real girder is precast
   segmental: vertical joint lines every few metres along the soffit and
   sides. Ours is a smooth continuous box. Cheap and reads at any distance.
2. **Under-deck services** (metro.js): conduit/service pipes running the
   length of the soffit, light fittings under the deck. Ours is bare.
3. **Glass curtain wall + unfinished concrete frame facades**
   (facades.js). The arterial frontage here is largely full-height
   glazed/mirror-glass 5-7 storey blocks, plus one red-panel-and-glass
   commercial block — and, critically, **unfinished concrete frames**: bare
   slabs and columns with no infill walls, everywhere in Dhaka and entirely
   absent from our city. Add both as atlas cell types, weighted onto
   arterial frontage; keep brick/render for the back-blocks. The advisor
   has already shifted CELL_MATERIALS to 81% brick + stained concrete —
   keep that for the side streets.
4. **Two signage grammars** (signs.js). Today `SHOP_NAMES` (signs.js:219)
   is a flat 18-entry list picked uniformly, and `SIGN_BG` (signs.js:237)
   is 7 arbitrary colours. Replace with:
   - SIDE STREETS: weighted to the real POI mix measured from OSM within
     500 m of Pallabi — **55 pharmacy, 40 school/madrasa, 40 bKash/telecom
     money-transfer, 25 clinic/dental, 12 restaurant, 9 ATM, 8 coaching,
     5 bank**. Colour by category, not at random: pharmacy green with a
     cross, telecom/mobile-money pink and orange, coaching-centre boards,
     dental chambers, tailors, tea stalls.
   - ARTERIAL (the spawn street): big fascias and **vertically stacked
     illuminated boxes up building corners**, plus large channel letters
     across a facade top — that is what the owner's photo shows. Not a
     single ground-floor band.
   Suggest palettes and layouts; do NOT clone real brand logos or trade
   dress.
5. **Green-roof covered footbridge** (metro.js) at Pallabi if budget
   allows: galvanised truss with diagonal bracing, green corrugated roof,
   straight stair to the footpath. Green roofing is the corridor signature.

Items about the striped median kerb, guard railings and median saplings
belong to streets.js and are NOT yours.

## Constraints
- Draw calls must not rise. facades.js is ONE atlas, ONE material — keep it
  that way, no per-building textures. Record HUD draws/tris/fps before and
  after.
- Another session has edited this repo concurrently today. RE-READ every
  file immediately before editing it.
- Dev server ALREADY RUNNING at http://localhost:5183; do not start or kill
  one. North scene is default. Enter at [399,318] in an 800x450 frame.
- Hidden-pane rule: after moving call `window.__mirpur.player.update(0)`
  then `window.__mirpur.capture()`.
- A pre-existing console error ("renderer.render threw ... reading
  'value'" at main.js:536) is known and is not yours.

## Screenshots (distinct md5s, each read back with the Read tool)
- `p9-before.jpg`   — the spawn view before your changes
- `p9-pier.jpg`     — a pier from street level, to judge the flare
- `p9-after.jpg`    — the same spawn view after, for direct comparison
- `p9-signs.jpg`    — shopfronts close up, showing the side-street mix
- `p9-arterial.jpg` — the arterial frontage: glass, unfinished frame, stacked signs
Write your findings into docs/MIRPUR12-PASS.md AS YOU GO. Seven executors
have been stopped mid-task today; the ones that wrote nothing cost the most.
Take your own tab with tabs_create and close it when done. No sub-agents,
no git commands. Never claim a look you did not see rendered.

---

## OWNER RESTATEMENT, appended: "real looksike buildings, texts,
## structures, textures"

Four things, and the owner has now asked for them three times. Treat this
as the acceptance test, not the brief text above:

**BUILDINGS** — the massing is already right (median footprint 126 m2,
storeys peaking 5-8, flush to the street). What is wrong is that every
building is the same KIND of building. The owner's photos show, on one
stretch of one street: mirror-glass commercial blocks, a red-panel-and-glass
tower, weathered render apartment blocks, and a bare unfinished concrete
frame. Variety of TYPE is the deliverable, not more of the same wall.

**TEXTS** — the signs must read as Dhaka signs. Bangla first and larger,
English transliteration smaller underneath, which is how the real boards
are laid out (the owner's photo shows exactly this). Real shop categories
in the real proportions (55 pharmacies : 40 telecom : 40 schools per
500 m). Legible at street distance, not mush: check the actual rendered
pixel size of the Bangla glyphs at 10 m and say what it is in the doc. If
the atlas cell is too small for legible Bangla, raise the cell resolution
rather than shipping unreadable text.

**STRUCTURES** — the pier flare (advisor has done a first pass, verify it),
the precast girder segment joints, the under-deck conduits and lights, the
green-roof footbridge. These are the things the eye locks onto under a
viaduct and we get all of them wrong today.

**TEXTURES** — surface truth: exposed brick courses, render staining and
damp streaks below window sills and parapets, AC units, balcony steel
grilles, roof water tanks, shutter corrugations on closed shopfronts.
`public/textures/` already has the CC0 sets (see MANIFEST.json and
docs/TEXTURES-METRO.md) — brick-old, concrete-stained-1/2,
plaster-weathered-1/2 are already wired into the atlas. Use what is there
before adding anything new; if you do add, CC0 only, credited in
public/textures/LICENSES.md.

Judge every one of the four against `p9-before.jpg` vs `p9-after.jpg` from
the identical camera, and say honestly in docs/MIRPUR12-PASS.md which of
the four you actually moved and which you did not.
