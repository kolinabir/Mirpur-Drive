# Metro rebuild: findings from user screenshots (advisor notes)

These are the problems seen at street level under the viaduct and at the
Mirpur 11 platform. The next executor pass on src/metro.js and the main-road
part of src/streets.js must fix all of them. Build to reference/metro/SPEC.md
once it exists; the notes below are the visual acceptance criteria.

## A. Under the viaduct (street view)

1. **The girder reads as a solid black lid sitting on the road.**
   - Underside is pure black: light it (hemisphere ground + ambient are in
     sky.js; verify the girder material is not double-darkened by vertex
     normals pointing the wrong way on the soffit/haunch faces).
   - The current stepped shape (girder box + a separate narrower "haunch" box
     hanging 0.9 m below it) is wrong. Replace with ONE trapezoidal box-girder
     cross-section: top flange ~10.5 m wide, webs sloping inward to a bottom
     flange ~5.5 m wide, overall depth ~2.0 m. No separate haunch.
   - Concrete must be light warm grey with a photographic concrete texture
     and rain streaks, not flat dark brown.

2. **The pier stands at the edge of the road, not in the middle.** The OSM
   metro alignment and the OSM road centreline are a few metres apart, so the
   pier lands in the outer lane against the shopfronts. Fix: the main road
   under the viaduct must be generated FROM the metro centre alignment, not
   from the OSM road way. Build a dedicated carriageway ribbon along the
   metro centreline: 2 x 10.5 m carriageways with a 3.0 m planted median in
   the middle; the piers stand in that median. Suppress the OSM primary-road
   ribbon wherever it is within 15 m of the metro alignment so the two do not
   overlap.

3. **The pier is a plain box.** Real Line 6 piers are a single rectangular
   column with a slight taper and a wide "hammerhead" pier head under the
   girder. Model: shaft 2.0 x 1.6 m at the base tapering to 1.8 x 1.5 m,
   pier head 5.5 m wide x 1.6 m deep x 1.4 m tall, chamfered underside,
   visible pile-cap plinth 3.4 x 2.8 x 0.5 m at ground. Textured concrete.

4. **The viaduct should feel like a continuous covered corridor** ("like a
   tunnel" in the user's words): a smooth continuous soffit overhead, piers
   at even ~32 m spacing down the median, daylight from both sides, traffic
   passing on both sides of each pier. Nothing from the station (stair cores,
   pavilions) may stand in the carriageway.

## B. Platform level (Mirpur 11 view)

5. Canopy ribs are rotated 90 degrees and oversized: they arch ALONG the
   track with ~15 m radius and loop over neighbouring buildings. The canopy
   surface itself does not render at all. Rebuild the canopy as a proper
   cross-section arc ACROSS the platform: ~20 m wide, ~4 m rise, extruded
   along the platform length; thin ribs in that same plane every ~11 m;
   columns on the outer platform edges. Light grey / off-white, DoubleSide.
6. Platform floor is incomplete: slab ends at the yellow line with a void
   beyond. Platform floor must run from the platform edge out to the canopy
   columns on both sides. Station name boards mount under the canopy.
7. Horizon "grey wall": sky-dome haze band and fog colour do not match, and
   the ground plane ends inside the fog distance. Set fog colour == sky haze
   colour per preset, extend the haze band below the horizon, extend the
   ground plane pad beyond fogFar.

## C. Texture and finish (see reference/metro/SPEC.md ADDENDUM, which wins)
8. Concrete: CC0 concrete-stained maps tinted to pale #C9C7BE with streaks.
   Concourse and stair cores: RED-BROWN BRICK panels with pale concrete bands
   and frame (NOT glass curtain wall). Canopy: grey tubular trusses, dark
   ribbed underside, off-white top, GREEN eaves trim. Entrances: green
   corrugated barrel-vault canopies. Signage: white pill boards, DMTCL GREEN
   #0C7A4E / #006747. Remove every use of teal #00A19A.
9. Overhead catenary: portal gantries at stations, cantilever masts on the
   viaduct. Currently missing entirely.
10. Platform screen doors are half-height (~1.5 m) stainless + glass.
11. Train: stainless silver, green window-belt band, green cab face with
    white lower nose, red skirt and door stripes. Not white-and-teal.

Acceptance: screenshots from (a) the street under the viaduct looking along
it, (b) the Mirpur 10 platform, (c) aerial over Mirpur 10 roundabout.

## D. Regression seen mid-rebuild (owner screenshot, ~278 m south of Mirpur 10)

12. **A large grey plane hangs below/beside the girder and slopes down across
    the street, over the shopfronts.** It is not part of any real structure.
    Suspects, in order: the entrance bridge deck (`bridgeLen` is derived from
    `coreX - bridgeStart` and goes wrong when the core offset is smaller than
    the road half-width, producing a negative or huge length); the barrel
    vault built from `bridgeLen + 4`; or a canopy shell quad picking up a
    stale vertex. Clamp `bridgeLen` to a sane positive range, assert every
    generated box has finite positive dimensions, and verify no station part
    extends beyond the station's own footprint.
13. **Piers render as white cylinders**, not the chamfered rectangular
    fluted shafts with hammerhead caps that photo 01 and photo 26 show.
14. Nothing belonging to a station may overhang the carriageway or the
    shopfronts. Add a build-time check: every station child's world bounding
    box must lie within (station centre +/- 110 m along track, +/- 40 m
    across).
