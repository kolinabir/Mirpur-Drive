# P11-T — Rebuild the entrance shell as one sloped enclosure

**Owner: `src/metro.js`** (shell massing) **and `src/interior.js`**
(escalator deck rake only). Another session is editing src/signs.js,
tools/, public/ — never touch those. Do NOT use the browser preview tools;
the advisor verifies. Do not commit.

## Status: this is the THIRD attempt at this shell
P11-B built it as 6 Z-stepped segments. P11-P closed the riser gaps and
added per-segment flat roof caps. Both were reported as fixed. The owner
has now sent three screenshots of it and calls it "empty" and "looks bad",
and the advisor has confirmed from outside at Pallabi: it reads as a
**brick ziggurat** — a staircase of stacked boxes with pale stepped caps —
and from inside as two leaning brick planes over an open stair.

The stepped construction is the problem. Stop patching it. Replace the
massing with the shape it should have been.

## Target form (specify once, build once)
A stair enclosure is a simple thing: a rectangular box in plan, with a
**single flat roof plane raked to match the stair**, walls on both long
sides, a wall at the top end where it meets the concourse bridge, and one
doorway at the footpath end.

Build it as, in station-local coordinates, per entrance:
1. **Two side walls** spanning the full stair run in Z, whose top edge is a
   single straight rake from the low (footpath) end to the high
   (concourse) end. Build each as ONE geometry, not per-segment boxes. If
   a sloped top edge is awkward with `BoxGeometry`, use a `Shape` +
   `ExtrudeGeometry` (a trapezoid extruded across the wall thickness) —
   that is plain 2D geometry, no rotation maths to get wrong.
2. **One raked roof slab** spanning the same run, matching the side walls'
   top edge. One box, rotated about the local X axis by
   `Math.atan2(rise, run)`. That is the only rotation in the whole shell;
   get it right once. Overhang the side walls slightly so there is no
   seam.
3. **A head wall** at the concourse end, from roof down to the landing,
   with the opening where the existing bridge/landing passes through.
4. **A front wall** at the footpath end with the existing 3.0 x 2.6 m
   doorway and its entrance fascia sign above it — keep the doorway
   exactly where it is now; that part works.
5. **A floor slab** under the whole footprint. In the owner's screenshots
   the shell stands on bare earth with daylight under it.

Delete the per-segment roof caps and riser panels — they exist only to
patch the stepped massing and become dead weight once the walls are single
raked surfaces.

## Also: the escalator deck rake looks wrong
The owner's screenshot shows a grey ramp projecting diagonally out through
a brick wall. `interior.js#buildEscalatorDeck` rakes its deck with
```js
deckGeo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir));
```
whose author flagged at the time that they could not check the sign by eye
without a browser. Now that entrances can face either way along the spine
(`dir` = +-1, published by P11-Q), verify this rake is correct for **both**
directions — a `setFromUnitVectors` from a fixed +Z axis has an
undetermined roll when `dir` points the other way. Same check for
`buildGuardrail`. Fix so both a `dir: +1` and a `dir: -1` entrance rake
the right way.

## Verify against the RIGHT stations
Every previous pass was checked at Mirpur 10 and passed. **Reason about
Pallabi and Uttara South**, whose entrances now sit at different local Z
after P11-R, and about both `dir` values. State in your report which
station and which `dir` you traced by hand.

## Do not regress (all landed today)
`setPlatformDoors`/`platformDoorBays`/`setPsdOpen` exports; the lift's
footpath position, adjacent-floor rule and ticket gating; P11-Q's
`dir`/`lz` publication; P11-R's building-aware entrance placement; albedo
normalisation; platform floor at DECK_Y.

## Acceptance (the advisor will check at Pallabi and Uttara South)
1. From outside, the entrance reads as one clean building with a sloping
   roof — no stepped/ziggurat profile, no stacked caps.
2. From inside, standing at the foot of the stair: walls both sides, a
   roof overhead, a floor underfoot, and daylight only through the
   doorway behind and the opening ahead.
3. No geometry projects through a wall — including the escalator deck, at
   both `dir` values.
4. Walking in still climbs feetY 0 -> 8.
5. Draw calls per station no higher than today (this should REDUCE them:
   one raked wall replaces ten boxes).

Append dated sections to `docs/METRO-REVIEW.md` and `docs/INTERIOR-PASS.md`.

## ADDED MID-TASK (owner, with screenshot) — the stair runs into the roof

Owner: "stairs go in the roof! no clean entry."

Screenshot, standing on the stair at Pallabi looking up: the treads climb
and **terminate against the concrete ceiling**. There is no opening at the
top — the enclosure's roof cuts across the stair before it reaches the
landing. You cannot walk up it without your head going through the slab.

This is the same stepped-massing failure as everything else in this brief:
the roof advances in flat per-segment steps while the stair rises
continuously, so the clear height above the nosing shrinks along the run
and reaches zero near the top.

**The raked roof specified above must be dimensioned from the stair, not
from the walls.** Requirements:

- Maintain a **minimum 2.3 m clear height measured vertically from every
  stair nosing to the underside of the roof**, along the entire run,
  including at the very top step and over both landings. Compute the roof
  plane's height from the stair line plus that clearance — do not derive
  it from the wall tops and hope.
- The top of the stair must arrive at a **real opening**, not a wall or a
  slab: the head wall's opening and the roof's end must leave the landing
  and the route onto the concourse bridge fully clear.
- Check the headroom at BOTH ends and at mid-run. A roof that clears at the
  bottom and clips at the top is exactly the current bug.
- Do the same check for the escalator deck alongside the stair.

Add to acceptance:
**6.** Standing at the foot of the stair and looking up the run, the roof
is above the stair for its whole length and the top of the stair opens
into the landing. No tread disappears into a ceiling.
**7.** Walking up (feetY 0 -> 8) passes no geometry at head height —
verify the clear height numerically along the run, not by eye alone.

## CORRECTION to the ADDED MID-TASK section above (advisor, measured)

**My "headroom goes to zero" diagnosis was wrong.** A read-only analysis of
the current code computed the actual clear height from the stair nosing to
the roof underside, and it never approaches zero:

```
topY_i   = CONCOURSE_Y * ((i+1)/SEGMENTS) + clearance   (clearance = 2.9)
tread(t) = CONCOURSE_Y * t
```
Roof is flat across each 1.4 m segment while the tread keeps rising, so
clear height sawtooths 3.7 m -> 2.9 m within every segment and repeats:

| position | tread | roof underside | clear |
|---|---|---|---|
| street (t=0) | 0.0 | 3.7 | 3.7 m |
| near edge of segment i | 8(i/10) | topY_i | 3.7 m |
| far edge of segment i | 8((i+1)/10) | topY_i | **2.9 m** |
| concourse (t=1) | 8.0 | 10.9 | 2.9 m |

Minimum is **2.9 m across the whole run, on every entrance**, already
above the 2.3 m I asked for. The 2.3 m clearance requirement in the
section above is therefore satisfied by the existing numbers and is NOT
the thing to fix. Ignore it as a defect; keep it only as a floor the new
raked roof must not drop below.

**What the owner is actually seeing.** The roof caps and, more importantly,
the solid full-width **brick riser panels** sit directly in the upward
sightline. From anywhere on the stair except the final 1.4 m, the player
looks up into an opaque riser with no opening visible — the genuine gap
into the concourse only exists past the end of the run. It reads as
"stairs go into the roof" even though nothing is within 2.9 m of their
head. The single raked roof this brief already specifies removes the
risers entirely and fixes this as a side effect: keep that as the fix, and
make sure the top of the run has a visible opening ahead rather than a
closed cap.

## SECOND DEFECT FOUND (advisor) — the bridge and green vault are at the wrong end

`src/metro.js` builds the "Bridge from the concourse edge to the core" and
both `corrugatedGreen` barrel-vault pieces (`vault`, `vaultEnd`) at
**`z = zc`** — the entrance's *street-level foot*.

But the stair reaches concourse height at the landing, which
`src/interior.js` puts at `landingZ = centerZ - sign*(RUN_ENTRANCE+1)` —
about **15 m along the run from that foot**, and that is also where the
perimeter-wall gap into the concourse is cut.

So:
- the real top-of-stair landing has **no bridge and no canopy over it** at
  all, and
- the bridge and green vault instead hover over the street doorway,
  disconnected from the walkable path they are supposed to cover.

That is why the green barrel vault appears in the owner's screenshots as a
detached green object floating near the entrance with nothing under it.

**Fix:** build the bridge and its vault at the **landing** Z, not at `zc`,
deriving it from the same `landingZ` expression interior.js uses (or from
the `dir`/`lz` fields metro.js now publishes on `entrances[]`) so the two
files cannot drift apart again — this is the same two-files-deriving-the-
same-thing-independently bug as P11-Q. Verify for both `dir` values.

Add to acceptance:
**8.** The green barrel vault and the bridge sit over the top of the stair
and the concourse landing, not over the street doorway, at every entrance
and for both `dir` values.
