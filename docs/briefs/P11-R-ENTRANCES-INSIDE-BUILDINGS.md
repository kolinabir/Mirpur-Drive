# P11-R — Half the station entrances are inside real buildings

**Owner: `src/metro.js` and `src/interior.js`.**
Another session is editing src/signs.js, tools/ and public/ — never touch
those. Do NOT use the browser preview tools; the advisor verifies. Do not
commit.

## Owner report
Standing at Pallabi: "where the entry?" — and a screenshot of a bare
staircase with no shell, then a 7-storey OSM building sitting exactly where
the entrance should be.

## Measured live — this is the headline bug

The advisor point-in-polygon tested every entrance's world position against
every building footprint in the loaded scene:

| station | entrance | inside a building? |
|---|---|---|
| Mirpur 10 | A | no |
| Mirpur 10 | B | no |
| Mirpur 10 | **C** | **YES** |
| Mirpur 10 | **D** | **YES** |
| Mirpur 11 | A | no |
| Mirpur 11 | B | no |
| **Pallabi** | **A** | **YES** |
| **Pallabi** | **B** | **YES** |
| Uttara South | **A** | **YES** |
| Uttara South | B | no |

**5 of 10 entrances are buried inside real OSM building footprints**, and
at Pallabi — where the owner is standing — *both* of them are. Walking to
where the entrance should be puts you against a shopfront shutter; flying
up shows a seven-storey block occupying the spot.

## Root cause
`src/metro.js`, entrances loop:
```js
const roadHalf = 12.0;
const coreOffset = roadHalf + 4.5; // lands on the footpath outside traffic
...
const coreX = side * coreOffset;   // always +-16.5 m from the spine
```
Every entrance at every station is placed at a fixed +-16.5 m offset with
**no check against the building data**. The file's own comment already
admits `roadHalf` is "an ESTIMATE". Where the real frontage happens to be
set back (Mirpur 10 A/B, Mirpur 11) it lands on clear footpath; everywhere
else it lands inside whatever OSM building is there.

This is the same class of bug as docs/OWNER-FEEDBACK-2026-09-07.md item 2
(poles standing in the carriageway) and the historical note in
docs/INTERIOR-PASS.md ("A real building blocks the south entrance's
concourse-side landing"). P1-E3c moved the cores to real
`station.entrances[]` coordinates to dodge one instance of it; the
underlying placement rule was never made building-aware.

## Fix
Make entrance placement **data-driven and validated**, not a constant.

- `buildMetro()` already receives the scene, so the building footprints are
  reachable. For each entrance, search for a position that is
  simultaneously: (a) outside every building footprint, (b) outside the
  carriageway (`|localX| >= PORTAL_COL_X`, already exported on `METRO`),
  and (c) clear of the viaduct piers and portal columns.
- Search in a sensible order — slide **along the spine** (local Z) first,
  since the footpath runs that way and the concourse box is 60 m long, then
  outward in local X if no clear spot is found. Keep the entrance attached
  to the concourse: the connecting bridge in metro.js must still reach it.
- Include a real clearance margin: the shell is ~4.8 m wide and the stair
  run is ~14 m long, so test the whole footprint, not just the centre
  point. A centre point that clears a wall by 10 cm is still a broken
  entrance.
- If no clear position exists for an entrance after a bounded search, drop
  that entrance rather than placing it inside a building, and
  `console.warn` which station/letter was dropped. A station with one good
  entrance beats one with two buried ones. Never emit an entrance you know
  is buried.
- Publish the final chosen position (and the existing `dir`/`lz`/`side`)
  on `entrances[]` as it already does, so `interior.js` follows
  automatically — do not re-derive placement there.

## Do not regress (all landed today, verified)
`setPlatformDoors` / `platformDoorBays` / `setPsdOpen` exports and
signatures (src/stationlife.js depends on them); the lift on the footpath
with its adjacent-floor rule and ticket gating; the P11-Q `dir`/`lz`
publication and its use in interior.js; entrance-shell risers; albedo
normalisation; platform floor at DECK_Y.

## Acceptance (the advisor will check live, at ALL FOUR stations)
1. Re-running the advisor's point-in-polygon test returns **zero**
   entrances inside any building footprint.
2. At Pallabi specifically, both entrances stand on open footpath with a
   visible doorway, and walking into either climbs feetY 0 -> 8.
3. No entrance stands in the carriageway.
4. Any entrance that had to be dropped is named in a console warning.
5. Mirpur 10 A and B are unchanged (they are correct today).

Append dated sections to `docs/METRO-REVIEW.md` and `docs/INTERIOR-PASS.md`.
Report the final position of all 10 entrances and which ones you moved.
