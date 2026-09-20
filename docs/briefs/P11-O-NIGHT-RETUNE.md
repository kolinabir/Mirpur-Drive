# P11-O — Night lamp retune, with values measured live

**Owner (the ONLY file you may edit): `src/night.js`.**
Do NOT use the browser preview tools (shared, throttled); the advisor
verifies. Do not commit. Another session is working elsewhere in this repo
(src/signs.js, tools/build-scene.mjs, public/scene*.json) — stay in
night.js.

P11-L's structural fix is correct and verified: glow points now sit at real
head heights (7.6 / 8.9 — confirmed live, previously all 0.0), and zero
dynamic lights are below ground (previously all 24 at y = -1.2). Keep all
of that. These are the follow-up look values, each measured in the browser
by A/B-ing the live scene at `night` near Mirpur 10.

## 1. The glow sprites are 16 METRES wide
`glowMat` is a `PointsMaterial` with `sizeAttenuation: true`, so `size` is
in world units, not pixels. At `size: 16` each lamp renders as a 16 m ball
of light. Now that they are up at head height instead of half-buried in the
road, they read as enormous overlapping orbs floating in front of the
skyline — worse than the original bug. (The old `34` was only tolerable
because at y=0 most of each sprite was inside the ground.)

**Measured fix: `size: 2.6`.** Confirmed live — at 2.6 each lamp head
carries a tidy halo and the street reads like a real lit road. Anything
above ~4 starts to bloom into its neighbours.

## 2. The ground pools were buried under the road surface
`poolMesh` instances are placed at **y = 0.05**. The road/paving geometry
sits above that, so the pools were hidden and contributed nothing.

**Measured fix: y = 0.25.** At 0.25 the pools are visible and give each
lamp a proper pool of light on the tarmac. Verify against the actual road
surface height rather than trusting 0.25 blindly — read it from the street
geometry if you can, and pick the smallest lift that clears it, to avoid
the pools hovering visibly when seen from a low angle or from the car.

## 3. The 24 dynamic point lights contribute almost nothing — decide their fate
This is the important one. The advisor isolated it: with the pools hidden
(`poolMesh.visible = false`) and the point lights raised all the way to
`intensity 30 / distance 26`, **the lit patch on the road disappeared
entirely**. All of the visible road lighting is coming from the additive
pool circles; the 24 real `PointLight`s are close to pure cost.

P11-L set them to `7 / 16`, which is dimmer still, so as shipped they are
effectively invisible.

Pick one and justify it in your report:
- **(a)** Raise them until they demonstrably light the road, and drop the
  additive pools to a subtle sheen so the two do not double up. Note that
  24 point lights is a real per-fragment cost on a scene already carrying
  30k buildings — check the FPS effect.
- **(b)** Cut the dynamic point lights entirely (or to a handful right
  around the player) and let the pools + glow sprites carry the look. They
  already do. This is likely the better trade and would give frames back.

Do not simply leave them at `7 / 16`, which is the worst case: full cost,
no visible contribution.

## 4. Reconsider lighting the power poles (advisor's error)
P11-L's report flagged that the 5766-instance family is utility/power poles
with a crossarm and **no luminaire** — so glowing them means glowing the
power lines. The advisor's P11-L brief was wrong to call them street lamps;
that inference came from bounding-box sizes, not from reading streets.js.

With the sprites at 2.6 m this is much less objectionable than it was at
16 m, but it is still lighting something that is not a lamp. Judgement
call: if a crossarm glow reads as a plausible pole-mounted light in the
Dhaka streetscape, keep it and say so; if it reads as glowing cable, drop
that family from the glow/pool set and keep only the 2716 cobra-heads. The
advisor will confirm visually either way.

## Acceptance
1. Lamp heads carry a contained halo, not metre-wide orbs.
2. There is visible pooled light on the road under lamps, with dark
   between — measured from a standing eye-height view on the road, not
   just from the air.
3. Whatever you decide in item 3 is justified with a frame-rate number.
4. Midday is untouched.

Append to `docs/HANDOFF.md` and report back with final values.
