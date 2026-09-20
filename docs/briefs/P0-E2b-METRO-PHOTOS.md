# P0-E2b: metro to the OWNER PHOTOS (targeted fixes, in this order)

Owner files: `src/metro.js`, `src/signs.js` ONLY. Docs: append to
`docs/METRO-REVIEW.md`. Screenshots: overwrite screenshots/metro-*.jpg.
Read: docs/briefs/P0-COMMON.md, reference/metro/OWNER-PHOTOS-2026-09-07.md
(THE spec now; it is Mirpur 10 itself), docs/METRO-REVIEW.md (what E2 did),
docs/REVIEW-2026-09-07.md "E2 metro: PARTIAL" (advisor verdict).
Do each item, screenshot it, then move to the next. Stop and report if an
item takes more than ~25% of your budget.

1. **Black slab at Mirpur 11** (metro-mirpur11.jpg, right half of the sky).
   Find it: with the debug hook, raycast from the camera into the black
   area (`new THREE.Raycaster()` from camera through NDC (0.6, 0.3)), log
   `hit.object.name` and its world bbox. Fix the geometry. Re-shoot the
   same view; the sky must be clear.
2. **Canopy is bright, not dark** (owner P6, P7). Underside = light
   corrugated off-white (#E4E2DA) lit by the sky (DoubleSide, no dark
   colour); trusses = WHITE tubular arches (0.3 m tubes, `TubeGeometry` or
   8-sided cylinders bent along the arch, every 9 m) with a few diagonal
   members; columns = white round tubes 0.45 m on the outer platform edge
   every 9 m; green eaves trim outside only. From the platform the view
   must be bright with white arches overhead and daylight at the sides.
3. **Piers** (owner P2, P3; SPEC A9): rectangular shaft 2.0 x 1.6 m with
   chamfered corners, slight taper, hammerhead head 5.5 x 1.6 x 1.4 m,
   pile-cap plinth. Replace the cylinder. Reuse one BufferGeometry per
   pier type and merge; do not add draw calls.
4. **Concourse box straddles the road** (owner P1, P2): the brick box spans
   the full carriageway (~26 m wide across the road x CONCOURSE_LEN along)
   with its underside at CONCOURSE_Y=8 m, carried on pale concrete portal
   columns 1.2 x 1.2 m standing on each footpath edge (x = +/- 13.5 m from
   the centreline), 4 per side. The viaduct girder passes through the box
   at deck level. Brick panels with thin pale bands, concrete frame,
   glazing band. Nothing of it stands in the carriageway.
5. **White pill fascia at Mirpur 10** on the beam under the brick, front
   and back: "মিরপুর ১০ [logo] Mirpur 10" black text on #F2F2EE, ~6 x 1 m.
   Keep the dark green boards with letters for the individual stair
   entrances (E2 built them).
6. **Platform kit visible**: half-height PSDs along the edge, roundel signs
   on columns, benches, a stainless lift core mid-platform. Shoot a view
   along the platform at eye height 1.6 m above the platform.
Screenshots: metro-mirpur11.jpg (same pose as before), metro-platform.jpg
(eye height on the platform, looking along), metro-street.jpg,
metro-pier.jpg, metro-concourse-ext.jpg (from the far footpath looking at
the box across the road). Distinct md5s via capture().

## ADVISOR CORRECTION 16:20 (second owner photo batch, see dossier
"Second batch"): item 2 canopy target is MID-GREY corrugated underside
(#8A8D8A) with light-grey lattice truss arches and GLASS SKYLIGHT strips
along the ridge letting sky through, not off-white. If you already built
off-white, retint; keep the arches. OCS masts every 30 m on both parapets
with cantilevers (item 6 extension) if budget remains.

## ADVISOR CORRECTION 16:35 (third batch, dossier "Third batch"):
- Canopy TOP surface is DARK GREEN corrugated (#2F6B4A), grey truss
  ends, skylight strip along the ridge. Set canopyTop colour to green.
- Entrance boards are WHITE with the logo tile and a green letter square,
  not dark green (retint makeEntranceLabel). White pill on the concourse
  beam at BOTH stations.
- Entrance stair foot: collapsible scissor gate, green curved canopy on
  grey tube posts, tactile strip, info board. Cheap boxes are enough.
