# P11-P — Owner still can't find the way in: entrance shell, lift, platform access

**Owner: `src/metro.js` and `src/interior.js`.**
Nobody else is editing those two right now. Another session is working in
src/signs.js / tools/build-scene.mjs / public/scene*.json — never touch
those. Do NOT use the browser preview tools (shared, throttled); the
advisor verifies. Do not commit.

## Owner report (with a screenshot)
"Still no door or open space to enter metro station by stairs! No lift
view! Also no way to enter platform by stairs!"

The advisor re-checked all three live. One is a false alarm, two are real,
and the owner's screenshot explains why all three *feel* true.

## 1. The entrance shell only reads as a building from one exact angle — REAL
There IS a doorway and a visible stair: standing on the footpath directly
in line with entrance D's stair run, you see a brick shell, an open
doorway, and the stair and escalator climbing inside it. The advisor has
that screenshot.

But the owner's screenshot, taken from an oblique angle a few metres away,
shows something else entirely: the shell reads as a row of **disconnected
stepped brick slabs with sky between them**, a guardrail crossing open air,
and the stair apparently standing outside in the open. P11-B built the
shell as "6 Z-stepped segments" tracking the stair's rise, and from
anywhere except head-on those steps do not join up into a building.

**Fix:** make the shell read as one enclosure from every approach.
- Close the gaps between the stepped segments — the walls must be
  continuous surfaces, not a staircase of detached slabs with sky showing
  through the risers.
- Give it a continuous sloped roof over the whole stair run, not per-step
  roof pieces.
- Exactly one obvious opening — the footpath-end doorway — with the
  existing entrance fascia sign above it, and solid wall everywhere else.
  Right now the outboard and lateral faces are ambiguous.
- Re-check it reads correctly from: straight on, 45 degrees either side,
  from across the road, and from directly above.

## 2. The lift is four thin sticks — REAL
Verified live on the Mirpur 10 concourse: the "E: call lift" prompt appears
and the interaction works, but there is **nothing there to see**. P11-A
added "4 corner posts, 0 -> DECK_Y, with a lintel band at each stop" — on
screen that is four skinny vertical lines and no lift at all. The owner is
right that there is "no lift view".

**Fix:** build a lift you can actually see and identify from across the
concourse:
- A real car — floor, ceiling, three solid sides, a glazed front — sized
  like the interaction implies (roughly 2.0 x 2.2 x 2.3 m).
- A visible shaft enclosure running street -> concourse -> platform
  (0 -> DECK_Y), glazed or framed, so the route between levels is legible
  from all three floors.
- Landing doors at each of the three stops, so it is obvious where it
  stops.
- The car should visibly sit at the level the player last sent it to; it
  does not need to animate smoothly, but it must not be at a level
  unrelated to `state.liftTween`.
- Keep it inside the existing bucket/merge pattern; a couple of extra
  draw calls is fine, a per-fixture mesh explosion is not.

## 3. "No way to enter platform by stairs" — NOT a geometry bug, but fix the cause
The advisor probed `walkable.supportHeightAt` in 0.2 m steps up both
paid-side cores at Mirpur 10: **both climb 8.0 -> 14.5 correctly** (side -1
at local X -7.15/-5.5, side +1 at +4.85/+6.5), and a screenshot from the
concourse shows a proper staircase with handrails going up to the platform.
The stairs are there and they work.

What is actually stopping the player is the **AFC gate line**. It sits
between the concourse and those stairs, and `tapIn()` refuses to open a
gate without a ticket. So a player who has not found the TVM bank hits an
invisible-feeling wall and concludes there is no way up.

Note also that `tapIn()`'s own comment is wrong about what the code does:
```
return; // no-ticket escape hatch: hint, never a hard block
```
It IS a hard block — the gate segment stays closed. Either make the comment
true or make the code match it. The advisor's preference: keep the gate
meaningful, but make the route obvious rather than punishing.

**Fix (legibility, not physics):**
- Make the gate line visibly a gate line — it should be obvious that this
  is a barrier with a way through it, and which lanes are open.
- Signpost the route: the TVM bank should be findable from where the
  player arrives on the concourse. `src/signs.js` already has
  `makeDirectionBoard` and `makeExitSign` factories (import, do not edit
  that file) — use them, or an equivalent, to point "Tickets" one way and
  "To platforms" the other.
- When the player is blocked at a gate without a ticket, the existing hint
  fires for 2 s. Make it unmissable and make it say where the TVM is.
- Confirm nothing else on the paid-side route silently blocks a player who
  HAS tapped in.

## Acceptance (the advisor will check live)
1. From four angles around entrance D — head on, 45 degrees each side, and
   from across the road — the entrance reads as a building with one clear
   way in. No sky between wall segments.
2. Standing anywhere on the concourse, the lift is visibly a lift.
3. A player arriving on the concourse can tell where to buy a ticket and
   where the platform stairs are without being told.
4. The paid-side stairs still climb 8.0 -> 14.5 on both sides (do not
   regress this — it works today).
5. Draw calls per station up by no more than ~6; FPS no worse.

Append dated sections to `docs/METRO-REVIEW.md` and `docs/INTERIOR-PASS.md`.
Report back, and say explicitly which of the three you consider fully
fixed versus improved.

## 2b. The lift stands in the middle of the carriageway — REAL (owner, added)

`src/interior.js:1040` places it at station-local **(8, -24)**:
```js
buildLift(bucket, collision, walkable, station, interactables, state, 8, -(CONCOURSE_LEN / 2 - 6));
```
The concourse box straddles the road on portal columns at
`PORTAL_COL_X = 13.5` (the footpath edge), and `metro.js` puts the
carriageway at `roadHalf = 12.0` either side of the spine. Local X = 8 is
therefore **inside the carriageway** — so the lift's street-level stop, its
car and its shaft all stand in the middle of the road, with traffic driving
through them.

`buildLift`'s own comment shows how this was missed:
> "Fixed interior placement (unpaid side, near the TVM bank) rather than
> tied to a specific entrance core — the lift only tweens feetY (doesn't
> move x/z), so it doesn't need to sit under any one entrance."

That reasoning is about the *concourse* level and forgets the shaft has to
come down to the street somewhere. This is the same class of bug as the
2026-09-07 owner report about poles standing in the carriageway
(docs/OWNER-FEEDBACK-2026-09-07.md item 2).

**Fix:** move the lift so its street-level stop lands on the **footpath**,
outside the carriageway — `|localX| >= PORTAL_COL_X` (13.5), ideally
alongside one of the `station.entrances[]` cores so the lift and the stairs
share a street frontage, which is also how the real stations are laid out.
Do not hardcode 13.5; read it from the same constants metro.js exports or
derive it, so it tracks any future change to the road width. Then check
that neither the shaft nor the car intersects the viaduct piers, the portal
columns, or the entrance shells at any level.

Add to acceptance: **6.** Standing on the road under the station and
looking up, nothing of the lift is in the carriageway; driving the length
of the station passes nothing.

## 2c. The lift skips the ticket floor and lands you on the platform — REAL (owner, added)

Owner: "The lift should take you to the ticket floor, not the platform."

Confirmed in `buildLift`'s interaction (src/interior.js ~line 671):
```js
const cur = player.feetY;
const target = stops.reduce((a, b) => (Math.abs(b - cur) > Math.abs(a - cur) ? b : a));
state.liftTween = { player, from: cur, to: target, t: 0, dur: 1.2 };
```
with `stops = [0, METRO.CONCOURSE_Y, METRO.DECK_Y]` = `[0, 8, 14.5]`.

It jumps to whichever stop is **farthest** from the player. So from street
level (`feetY = 0`) the distances are 0, 8 and 14.5 — and it always picks
**14.5, the platform**. The concourse (the ticket floor, `CONCOURSE_Y = 8`)
is the one stop it can never select from the street, because it is never
the farthest from anywhere.

Two things wrong with that:
1. It is backwards as architecture — a station lift from the street goes to
   the ticket hall. Nobody is lifted straight from the pavement to the
   trackside.
2. **It defeats the entire fare flow.** The AFC gate line and the TVM bank
   both live on the concourse, and item 3 above is about a player being
   blocked at the gates without a ticket — yet this lift teleports them
   past the gates onto the platform with no ticket at all. Item 3 and this
   are the same feature pulling in opposite directions.

**Fix:** the lift must serve floors, not "the farthest one".
- Street -> concourse. Concourse -> street or platform. Platform ->
  concourse. Never street -> platform in one move, and never past the gate
  line.
- The natural shape is a stop *adjacent* to the player's current level
  rather than the farthest; where a level has two neighbours (the
  concourse), either offer the choice or default to going up, and make the
  HUD label say where it is going — "E: lift to concourse", "E: lift to
  platform" — instead of the current bare "E: call lift". The label is
  also what tells the owner it is working.
- Keep the ~1.2 s eased `state.liftTween`; only the target selection and
  the label change.
- The lift must not become a way around the gates. If the player is on the
  concourse unpaid side without a ticket, the lift should not carry them to
  the platform — treat it exactly like the gate line, with the same hint.

Add to acceptance: **7.** From the street the lift goes to the ticket
floor, and the HUD says so. **8.** There is no route from street to
platform that skips the gate line — via the lift or anything else.
