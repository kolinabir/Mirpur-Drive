# P11-D — Wayfinding sign factories for MRT Line 6 stations

**Owner (the ONLY file you may edit): `src/signs.js`.**
Concurrent executors own src/metro.js, src/interior.js, src/main.js and
src/textures.js this pass — do not touch them, do not reformat them.
Do NOT use the browser preview tools (shared pane, throttled); the advisor
verifies. Do not commit.

## Why
The owner's report: the stations have no wayfinding at all. There is no
route map, no platform-direction board, no "to Uttara South" / "to
Motijheel" sign, no exit sign. A player who reaches the concourse has no
idea which platform goes which way — and neither platform is labelled.

`src/signs.js` already owns every canvas-texture sign in the game
(`makeStationLabel`, `makeEntranceLabel`, `buildShopSigns`) and is the
right home for these. You are building the **factories only**; a follow-up
brief places them inside the stations (src/interior.js, owned by someone
else right now). Ship factories that are trivial to place: each returns a
`THREE.Mesh` of a single plane with a canvas texture, centred on its own
origin, sized in metres, exactly like `makeStationLabel` does today.

## The real line (use these, do not invent stops)
MRT Line 6, south -> north:
Motijheel - Bangladesh Secretariat - Dhaka University - Shahbagh -
Karwan Bazar - Farmgate - Bijoy Sarani - Agargaon - Shewrapara -
Kazipara - Mirpur 10 - Mirpur 11 - Pallabi - Uttara South -
Uttara Center - Uttara North.

The four stations modelled in this game are **Mirpur 10, Mirpur 11,
Pallabi, Uttara South**. Northbound from any of them heads toward **Uttara
North**; southbound heads toward **Motijheel**. Bangla names matter — the
existing signs are bilingual and these must match that grammar. Brand
green is `#0C7A4E` / `#006747`; there is no teal anywhere in this project.

## Deliverables (all exported from src/signs.js)

1. `makeLineStripMap(currentStationEn, w, h)` — the horizontal strip route
   map DMTCL hangs in the concourse: all 16 stops as dots on a green line,
   names set at an angle or alternating above/below so they fit, the
   current station marked (larger dot / ring / "You are here" in both
   languages). Must stay legible at ~4 m wide viewed from ~3 m away, so
   render at a high canvas resolution and let mipmaps do the rest.

2. `makeDirectionBoard(towardEn, towardBn, viaListEn, w, h)` — the
   over-stair / over-gate board: a green field, a large arrow, "Trains
   toward <Uttara North|Motijheel>" in English and Bangla, and the next
   two or three stops in smaller type underneath. Include an `arrow`
   option (left/right/up) so the placement pass can point it correctly.

3. `makePlatformNumberSign(number, towardEn, towardBn, w, h)` — the
   platform-head sign: big numeral, direction underneath.

4. `makeExitSign(letters, w, h)` — "EXIT / প্রস্থান" with the entrance
   letters this exit serves (e.g. "A B"), matching `makeEntranceLabel`'s
   white-board language so exits and entrances read as one family.

5. `makeNextTrainDisplay(lines, w, h)` — the dot-matrix PID board: dark
   panel, amber/white monospace rows like "Uttara North   3 min". Takes an
   array of row strings so a later pass can drive it live. Return the mesh
   AND expose a way to repaint it cheaply (e.g. attach an `update(lines)`
   function to the mesh's `userData`) — do NOT allocate a new canvas per
   repaint.

## Constraints
- Follow the caching pattern already in this file (`stationLabelCache`):
  identical content at identical size must return a shared
  geometry+material so callers can instance them. The strip map especially
  — one per station, reused on both platforms and the concourse.
- Canvas textures need `colorSpace = THREE.SRGBColorSpace` and sensible
  anisotropy, same as the existing factories.
- Bangla text: the existing file already renders Bangla via the system
  font stack; match whatever `makeStationLabel` does rather than
  introducing a webfont.
- Keep every sign a single plane. No multi-mesh assemblies — the placement
  pass needs to merge/instance these.
- Do not add a dependency.

## Acceptance
The advisor will call each factory from the console and eyeball the
rendered canvas. Each must return a Mesh, be correctly sized in metres,
have readable text at its intended viewing distance, and be bilingual
where the real signs are.

When done, append a dated section to `docs/METRO-REVIEW.md` (the "signs"
part of it) describing what you added and the exact export signatures, so
the placement pass can be briefed against them. Report back to me.
