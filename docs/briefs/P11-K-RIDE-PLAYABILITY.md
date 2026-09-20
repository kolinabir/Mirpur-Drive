# P11-K — Make the ride actually playable, and fix two wrong-facts bugs

**Owner: `src/metro.js`, `src/stationlife.js`, `src/interior.js`.**
Do not touch src/main.js, src/signs.js, src/traffic.js, src/textures.js.
Do NOT use the browser preview tools (shared, throttled); the advisor
verifies. Do not commit.

## Context
P11-I and P11-J landed and the advisor verified the whole chain live:
doors slide, `E: board train` appears, riding works, and alighting puts
the player on the next platform at 14.5 m with support under them. The
feature is real. These are the defects found while testing it.

## Bug 1 — Mirpur 11 is never a stop (measured)
Riding north from Mirpur 10, the advisor logged `state.nextStopName`:

```
t=278.6  board at Mirpur 10
t=278.8  next: Pallabi
t=643.4  next: Uttara South
t=699.2  next: null   (terminus auto-alight)
```

**Mirpur 11 never appears** — the train carries the player straight past
it. The cause is station ordering: `metro.stations` comes back in scene
order, which is
`['Mirpur 10', 'Pallabi', 'Uttara South', 'Mirpur 11']` —
NOT geographic order. `metro.js`'s own `update()` already knows this and
sorts (`const ordered = [...stopDistances].sort((a, b) => a - b)`), so the
trains really do dwell at all four; it is `stationlife.js`'s next-stop
logic that walks the unsorted array.

**Fix:** order stations by distance along the alignment, never by array
index. The cleanest route is for `metro.js` to export the stop order it
already computes (`stopDistances` paired with station names, sorted) and
for `stationlife.js` to consume that instead of deriving its own. Then
`nextStopName` and the alight offer are correct by construction.

While you are there: the measured Mirpur 10 -> Pallabi ride took **366 s**,
but those stations are ~2.0 km apart and `SPEED = 16` m/s, so ~126 s plus
a dwell is expected. Something is making the train travel roughly 3x the
direct distance between two adjacent stops. Investigate and report what
you find — do not paper over it by scaling `SPEED`.

## Bug 2 — the platform direction boards are backwards (measured)
At Mirpur 10 the signs are placed:

| sign | station-local X |
|---|---|
| `direction-board:Uttara North` | -6 |
| `direction-board:Motijheel` | +6 |

But the advisor watched a train berth on **side +1** (the +X platform,
local X +4.55) and its subsequent stops were **Pallabi, then Uttara
South** — i.e. the +X platform is the **northbound** one, toward Uttara
North. The board there says Motijheel. Both boards are on the wrong
platform.

The P11-I executor flagged this honestly as an assumption ("DMTCL trains
keep left, mirroring Bangladeshi road traffic"). The assumption may well
be right about the real railway, but it does not match which track this
game's trains actually run on. **Derive the sense from the running
direction of the trains in this build, not from a real-world convention** —
and add a short comment saying that is deliberately what you did, so
nobody "corrects" it back to the convention later. Same check for
`platform-sign:1` / `platform-sign:2`.

## Bug 3 — the boarding window is 2.4 seconds
`DWELL = 6` in metro.js. stationlife.js duplicates that constant (it says
so, with a coupling-risk comment) and splits it 1.2 s open / 2.3 s hold /
2.5 s close. The advisor measured the doors fully open for **12 frames at
dt=0.2 — 2.4 s** — and a train reaches a given station only every **~505 s
(8.4 minutes)**. So the player gets a ~2 second window once every eight
minutes. Nobody will ever find this feature.

**Fix:**
- Raise `DWELL` to **14 s** in metro.js and **export it** so stationlife
  stops duplicating it. Retune the phases to something like 1.5 s open /
  9 s hold / 2.5 s close, and keep J's speed-based safety net that force-
  shuts the doors the moment a train actually moves.
- Raise the train count so headway is 2-3 minutes rather than 8.4. Two
  trains currently share the whole alignment; six would give roughly a
  3-minute headway. Space their `offset`s evenly instead of the current
  hardcoded `0` / `total * 0.55`. Report the resulting headway and the
  draw-call cost (trains are already merged per-car, so check it before
  and after).

## Bug 4 — the PSD lost its glass
Splitting the screen into sliding leaves dropped the `psdGlass` bucket:
the `psdGlass:Mirpur 10` mesh no longer exists and the doors now read as
plain opaque grey slabs. The fixed panels and the moving leaves should
both be stainless frame + glass, as they were before and as the owner's
photos show. Restore the glazed look on both, keeping the leaves in their
own movable mesh.

## Acceptance (the advisor will check live)
1. Boarding at Mirpur 10 northbound reports `Mirpur 11` as the next stop
   and offers to let the player off there.
2. The +X platform's direction board names the destination that trains
   berthing on that platform actually go to.
3. Doors are fully open for >= 8 s, and a train reaches Mirpur 10 at least
   every ~3 minutes.
4. Doors are still fully shut before any train moves.
5. The PSD reads as frame + glass, not solid slabs.
6. FPS no worse than today (~27 at Mirpur 10, ~159 draws).

Append dated sections to `docs/METRO-REVIEW.md`, `docs/INTERIOR-PASS.md`
and `docs/MAIN-WIRING.md`. Report back with the new headway, dwell split,
and what you found behind the 366 s ride time.
