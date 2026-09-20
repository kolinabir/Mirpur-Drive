# P11-Q — At every 2-entrance station, one stair runs the wrong way and has no shell

**Owner: `src/metro.js` and `src/interior.js`.**
Do not touch any other file (another session is editing src/signs.js,
tools/, public/). Do NOT use the browser preview tools; the advisor
verifies. Do not commit.

## Owner report, with screenshot
Standing at **Pallabi**: a bare staircase of floating dark treads with a
handrail, hanging in open air over the road, no brick shell around it, no
roof. "Still missing."

Every previous entrance check — mine included — was done at **Mirpur 10**,
which is the one station where this bug cannot occur. That is why P11-B and
P11-P both looked correct and the owner still had no way in.

## Root cause (measured live, exact)

The stair's direction along the spine is derived **independently in two
files, from two different values**, and at 2-entrance stations one of them
is exactly zero.

`src/metro.js:1259` — which legs exist:
```js
const legZs = legCount >= 4 ? [-halfL + 6, halfL - 6] : [0];
```
`src/metro.js:1296` — the shell's direction:
```js
const stairSign = zc < 0 ? -1 : 1; // matches interior.js: sign = lz < 0 ? -1 : 1
```
`src/interior.js:1178` — the walkable stair's direction:
```js
const sign = lz < 0 ? -1 : 1;
```

For a 2-entrance station `legZs = [0]`, so `zc === 0` and `0 < 0` is false:
**metro.js always builds the shell in the `+1` direction.** Meanwhile
interior.js re-derives its own `sign` from `lz`, the entrance's local Z
recovered through `worldToLocal()` from world coordinates — which for these
stations is zero plus floating-point noise. Measured on the live scene:

| station | entrance | local lz | interior sign | metro shell sign |
|---|---|---|---|---|
| Mirpur 10 | A / B / C / D | -24 / +24 / -24 / +24 | -1 / +1 / -1 / +1 | matches |
| **Mirpur 11** | A / B | 0.000 / 0.000 | **+1 / -1** | +1 / +1 |
| **Pallabi** | A / B | 0.000 / 0.000 | **+1 / -1** | +1 / +1 |
| **Uttara South** | A / B | 0.000 / 0.000 | **-1 / +1** | +1 / +1 |

So at each of the three 2-entrance stations, **one entrance's stair runs
the opposite way from its own shell** — the stair projects out into open
air with nothing around it, which is the owner's screenshot. Which of the
two entrances is broken is decided by the sign of a rounding error, which
is why Uttara South is flipped relative to the other two.

At Mirpur 10 the entrances sit at lz = +-24, both files agree, and
everything looks right. Hence the false confidence.

## Fix

**One source of truth for the direction, and it must never depend on the
sign of a legitimately-zero value.**

- In `metro.js`, decide each entrance's direction where the entrance is
  built and publish it: `entrances[]` already carries `{x, z, letter,
  side}` — add the direction (e.g. `dir`, matching the existing
  `sign`/`stairDir` convention) and make the shell use exactly that value.
- In `interior.js`, **consume `en.dir`** instead of re-deriving `sign` from
  `lz`. Keep a documented fallback to the old `lz < 0` rule only for the
  case where `dir` is absent, so nothing breaks if a scene predates it.
- For a 2-entrance station both entrances sit at the station centre, so
  pick a direction that is sensible rather than arbitrary: the stair should
  run **from the footpath inward toward the concourse centre**, and the two
  entrances should mirror each other about the spine (not both run the
  same way, and not depend on float noise).
- While you are there: `worldToLocal()` round-tripping an entrance that was
  itself computed from local coordinates is what produced the noisy zero.
  If `metro.js` can publish the local `lz` it already knows alongside the
  world position, `interior.js` should use that rather than recovering it
  through trigonometry.

## Acceptance (the advisor will check live, at ALL FOUR stations)
1. At **Pallabi, Mirpur 11 and Uttara South**, both entrances have a brick
   shell fully enclosing their stair, with a doorway at the footpath end —
   no bare floating staircase anywhere, from any angle.
2. At each of those stations, walking into either entrance climbs
   feetY 0 -> 8 and reaches the concourse.
3. Mirpur 10 is unchanged (it is correct today — do not regress it).
4. The two entrances at a 2-entrance station mirror each other about the
   spine.
5. No `x < 0 ? -1 : 1` test anywhere in this path is still being applied to
   a value that is legitimately 0.

Append dated sections to `docs/METRO-REVIEW.md` and `docs/INTERIOR-PASS.md`,
and state in your report which stations you reasoned through, not just
Mirpur 10.
