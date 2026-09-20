# On-foot gameplay pass — 20 September 2026

Owner picked "something to do on foot" from the gameplay options. Code lives in `src/streetlife/`.

## What shipped

- **Hail a ride** (`rides.js`). `E` near a rickshaw, CNG or bus (biased toward the one you face) opens a destination menu: stations, the active errand or map marker, the last cha stop, and the four nearest undiscovered places. The hailed traffic agent is hidden (`a.hidden`, traffic.js) and replaced by an identical standalone vehicle (`buildHireVehicle`) that follows an A* street route from `map/road-graph.js`. Keeps left; lane comes from the real road width, and under the viaduct it uses the corridor carriageway (9 m left of `metro.centre`). Holds behind traffic, squeezes past after 3.5 s. `E` gets down early (pro-rated fare), `Space` skips to the last 60 m. Drop-off is on the kerb. Rickshaws refuse trips over 1.8 km; buses only go to stations.
- **Cha stalls** (`world.js`, `index.js`). 3D tongs at the 30 OSM `shop=tea` POIs plus one per station. A cup costs taka, gives a line of adda, and saves the stall as the rest stop (Journal → Return). "Any work, mama?" gives a parcel errand to a real eatery 180–750 m away, routed on the minimap GPS, paying ৳30 + ৳0.16/m.
- **Street food trail.** Every named restaurant, fast-food place, cafe and sweet shop in the OSM data (437 north, 89 Bijoy) plus fuchka/jhalmuri carts. Eating adds to the food diary.
- **Places.** Named parks, fields, ponds, cemeteries, markets, campuses, libraries and stations are discovered on first visit (+৳15).
- **Wallet + journal** (`state.js`, `ui.js`). ৳300 to start, saved per district in `localStorage` (`mirpur.streetlife.v2.<district>`). `J` opens the journal.

## Follow-up, same day (owner feedback)

- **"Looks broken these!"** — the floating orange diamonds read as render glitches. Replaced with name-label sprites (`world.js` `refreshLabels`/`updateLabels`): a dark pill with the name and a kind tag, steady on-screen size, hidden behind buildings, faded out up close, excluded from raycasts.
- **"Real names should match how it looks."** Eateries are now anchored to the signboard `signs.js` hangs for that exact business (`group.userData.namedBays`), so the prompt name is the name over the door. Eateries with no signboard are dropped (437 → 327 in the north scene). Doing this exposed two long-standing sign bugs, both fixed in `signs.js`:
  1. `copyTextureToTexture`'s destination offset is GL-space (bottom-left) and ignores `flipY`, so every streamed real name was written into the vertically mirrored atlas row and its own sign showed the blank background. Fixed by flipping `dstY`.
  2. Every shop sign, generic and named, was horizontally mirrored: vertex 0 of each quad is on the viewer's right. Fixed by running U from 1 to 0.
- **Landmarks** (`landmarks.js`), positions read from OSM, not estimated: Benarasi Palli (18 saree-shop nodes + way 373801687), Mirpur 10 Foot Over Bridge (ways 344116313/4), Sher-e-Bangla National Cricket Stadium (way 121390579), Shaheed Suhrawardi Indoor Stadium (way 435037012), Mirpur 1 Foot Over Bridge (ways 349885959/60), Zoo Road (way 24402622). ৳60 each, Bangla name + blurb, label visible from 320 m.
- **Not reachable yet:** Bangladesh National Zoo (OSM node 13252006737 → scene −2024, 164) and the National Botanical Garden are 840 m and 670 m past the last road in `scene-north.json`. They need `npm run data` re-run with a wider cull before anything can be built there.

## Observed vs invented

- Real: POI names and positions, tea shops, eateries, named areas, road widths and routes.
- Invented: cart positions outside stations/parks (street carts are not in OSM), menus and prices, adda lines, fares.

## Cost

Two draw calls for stalls (bodies, tarps) plus at most eight label sprites. No lights added, so no shader recompile. 60 FPS held in every check.

## Not done yet

Gully cricket and kite flying. The zoo and botanical garden (see follow-up above). The Mirpur 10 foot over bridge is a discoverable place but has no walkable 3D model yet.

## Debug

`window.__mirpur.streetlife` → `.world.stalls/.eateries/.places`, `.state.data`, `.rides`, `.riding`.
