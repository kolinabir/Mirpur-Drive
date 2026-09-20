# P1-C (metro part): cut metro.js draw calls from 472 to under 120

Owner files: `src/metro.js`, `src/signs.js` ONLY. Docs: append to
`docs/DRAWCALLS.md`. Screenshots: screenshots/p1-draws-metro-*.jpg.
Read: docs/briefs/P0-COMMON.md, docs/DRAWCALLS.md (audit: metro group =
472 of 747 calls at the start view), docs/METRO-REVIEW.md.

Rules: no visual change (compare screenshots before/after at the start
view, platform, and Mirpur 11 views). Likely offenders: per-pier meshes
(241 piers x parts), per-mast OCS, per-column canopy parts, per-sign
meshes, per-PSD-panel meshes, train cars. Fixes in order of payoff:
1. Piers: ONE InstancedMesh per pier part (shaft, head, plinth) for the
   whole line, or bake all piers into one merged BufferGeometry per
   material. Same for OCS masts and parapet lights.
2. Stations: everything static in a station goes into the existing
   per-material buckets (one mesh per material per station). Signs: bake
   the pill/roundel/entrance boards' canvases into one texture atlas per
   station so they share one material.
3. Train: one merged geometry per material per train, not per car.
Report renderer.info calls for the metro group and the frame before and
after, at start / platform / aerial. Close your tab when done.

## ADDED 17:30: real textures must read on every metro surface
The advisor fixed src/textures.js (asset URLs were broken; every metro
texture load had silently failed). Photographic maps now load, but any
metro geometry without UVs still samples one texel and looks flat:
`bakeGeometry` zero-fills `uv` when a geometry has none, and
`meshFromBucketEntry` passes `uv = null`. Fix: generate world-space
box-projected UVs (pick the dominant axis of each face normal; u,v =
the other two world coords / 1 m) for every bucket geometry and for the
canopy/rib/girder builders, so concrete, brick and corrugated maps tile
at real-world scale. Apply: concrete-stained-1 on girder/piers/frame,
brick-old (tinted #A0523A) on concourse panels, corrugated-metal on the
canopy deck (tinted green on top, grey below) and on entrance canopies.
Verify with a close-up of a pier and of the brick box (p1-tex-pier.jpg,
p1-tex-brick.jpg): visible grain, streaks and brick courses at 5 m.

## ADDED 20:20 after E2b (advisor verified state; do these too, in order)
Read reference/metro/OWNER-PHOTOS-2026-09-07.md second + third batch
first. Then:
A. Canopy to the photos: top = DARK GREEN corrugated (#2F6B4A, use the
   corrugated-metal map tinted); underside = mid-grey corrugated (#8A8D8A,
   same map, grey tint); arches = light-grey LATTICE trusses (two chords
   + diagonals, 0.25 m tubes) every 9 m; skylight strips of translucent
   glass (#A9D6DB, opacity 0.5) along the ridge, 2 m wide, in 8 m panels
   with 1 m gaps; round downlights under the arches (small emissive
   discs); columns light grey 0.45 m on the outer platform edge.
B. Platform: floor granite-dark-polished (0.6 m repeat, tint #4F5250,
   roughness 0.35) with correct UVs; yellow tactile strip 0.6 m from the
   PSD line; PSDs half-height stainless (steel-brushed) with glass
   panels, visible from eye height on the platform; roundel signs on
   every second column; benches; lift core; hanging displays.
C. Entrance boards WHITE with green letter square (signs.js
   makeEntranceLabel); white pill stays at both stations.
D. OCS masts every 30 m on BOTH parapets with cantilever arms, portals
   every 5th; rigid conductor bar.
E. Then the draw-call merge (top of this brief) and the world-space UV
   + texture pass (17:30 section). Measure metro group draw calls with
   the visible-toggle method from docs/DRAWCALLS.md before and after.
Screenshots at eye height ON the platform (feet at DECK_Y, eye +1.6)
looking along, plus from the street looking up at the roof from 60 m,
plus the aerial (?debug, key 4) showing the green roof. Close your tab.

## ADDED 18:15 — owner Street View of the Pallabi viaduct (metro.js items)
Source: reference/mirpur12/OWNER-STREETVIEW-2026-09-07.md (owner-supplied
Google Street View of Begum Rokeya Ave / Mirpur Ceramic Rd, Sep 2023).
Read that file; these four items are metro.js's and are visible from the
new Mirpur 12 spawn, so they matter more than they did this morning:

F. **Pier shape is wrong.** The real pier is a TAPERED/FLARED column —
   narrower at the base, widening as it rises, flaring at the top into the
   girder seat — with strong VERTICAL FORM-LINES down the shaft and a
   cold-joint band near the bottom. Ours are plain rectangular boxes with
   a plinth. This is the most recognisable thing about the viaduct at
   street level; fix it before any further canopy polish.
G. **The girder is precast SEGMENTAL.** Vertical joint lines every few
   metres along the soffit and sides where segments meet. Free to add (a
   recessed line or a dark UV stripe) and reads at any distance.
H. **Under-deck services**: conduit/service pipes running the length of
   the soffit, light fittings mounted under the deck, staining. Ours is
   bare.
I. **Covered footbridge with a GREEN corrugated roof** at Pallabi:
   galvanised truss with diagonal bracing, open sides with mesh/rail
   infill, a long straight stair to the footpath with stainless handrails.
   Green roofing is the corridor's signature (same as the Mirpur 10 green
   barrel canopies). We build none at Pallabi.
