# P11-S — The lift raises you to a floor that isn't there, and you fall

**Owner: `src/interior.js`** (and `src/metro.js` only if a constant must be
published). Another session is editing src/signs.js, tools/, public/ —
never touch those. Do NOT use the browser preview tools; the advisor
verifies. Do not commit.

## Owner report
"Issue with lift — it goes up and player falls down!"

## Measured live, at the lift's own position
```
supportHeightAt(lift.x, lift.z, 0)     -> 0      (street: fine)
supportHeightAt(lift.x, lift.z, 8)     -> null   (concourse: NO FLOOR)
supportHeightAt(lift.x, lift.z, 14.5)  -> null   (platform:  NO FLOOR)
```
`state.liftTween` eases `player.feetY` up to 8.0 or 14.5, the tween
finishes, and `Player.update()` then asks the walkable registry what is
under the player. There is nothing, so gravity takes over and the player
falls straight back to the street. The lift "works" and then drops you.

## Root cause — P11-P's fix created this
P11-P correctly moved the lift out of the live carriageway to
`liftLx = side * (PORTAL_COL_X + 0.5)` = **+-14.0**. But nothing checked
that the upper levels have a floor at that X:

- concourse floor slab: local X **+-13.5** (`CONCOURSE_W / 2`)
- platform slabs: roughly local X **2.0 to 10.7**

So +-14.0 is outside the concourse by 0.5 m and outside the platform by
more than 3 m. The lift is now correctly clear of the road and delivers
you to thin air at both upper stops.

This is the second time on this pass that a fix moved geometry without
checking the walkable registry followed it (the first was the platform
floor at DECK_Y vs the visible slab at 14.9). **Whenever anything that
carries the player moves, re-probe `supportHeightAt` at its destination.**

## Fix
Give every lift stop a real floor at the lift's own X/Z, and make the
route continuous:

- Register a walkable landing slab at each served level at the lift's
  position, sized to the car and **overlapping the deck it serves** so
  there is no null-support sliver between stepping out of the car and
  standing on the concourse (the 0.1 m gap between the stair and escalator
  ramps in P11-A was exactly this failure and had to be fixed the same
  way — give it real overlap, not a shared edge).
- The concourse is only 0.5 m away, so a short landing pad bridging
  +-14.0 to the concourse edge at +-13.5 is enough. Add the matching
  visible geometry so the player can see the floor they are standing on.
- **The platform is the hard case**: its deck stops at local X 10.7, so at
  X 14.0 the lift cannot open onto it at all. Choose deliberately and say
  which in your report: either (a) run a short link bridge from the lift
  to the platform deck, with walkable slabs and visible geometry and a
  guard rail, or (b) have the lift serve street and concourse only, and
  remove the platform from its stop list so it never offers a trip it
  cannot complete. Do not leave it offering the platform and dropping the
  player.
- Whatever you choose, the ticket gating from P11-P section 2c must still
  hold: no route from the street to the platform that bypasses the gate
  line.

## Acceptance (the advisor will check live)
1. `supportHeightAt(lift.x, lift.z, y)` returns a real height, not null,
   at **every** level the lift will actually take the player to.
2. Ride the lift street -> concourse: the player ends at feetY 8.0 and
   **stays there** across at least 2 s of simulated frames — no fall.
3. If the lift still serves the platform, the same holds at 14.5, and the
   player can walk from the lift onto the platform deck without falling
   through a gap.
4. The lift is still clear of the carriageway (do not undo P11-P/2b).
5. Adjacent-floor rule and ticket gating from 2c still hold.

Append a dated section to `docs/INTERIOR-PASS.md`. Report which option you
took for the platform and the probe results at each stop.

## Second item, same file — close the see-through stair treads

Standing at the foot of an entrance stair you can see daylight, the road
and shopfronts through the gaps between the treads. In `buildCore`
(src/interior.js, the visible-tread loop) each tread is baked as an
independent thin box (0.06 tall, `stepDepth * 0.96` deep) with a 4% gap
between consecutive treads and nothing behind or under them — no riser
face, no closed stringer, no soffit. It reads as a rendering fault rather
than a staircase, and it undercuts the enclosed shell the P11-T rebuild
just achieved.

Close it. The player's physical support comes from the separate
`rampLocal` ramp, not these visual treads, so this is low-risk geometry
only. Either add a vertical riser face per step at the back edge of each
tread, or bake one continuous sloped soffit under the whole run — whichever
gives fewer draw calls. Keep it inside the existing bucket/merge pattern.

Add to acceptance: **6.** Looking up the stair from the foot, no daylight
or street geometry is visible between the treads.
