# P13-E — Let the player jump straight to the other district

**You own: `src/main.js` and `src/districts.js`. Nothing else.**
Do NOT touch `src/minimap.js`, `index.html`, `src/sangsad.js`, or any scene
file — two other executors are in those right now. Do not commit. Do not
use browser preview tools.

## The complaint (owner, live, 2026-09-08)

> "cant jumb to mirpur!"

Correct. Once you are in the Bijoy Sarani district the ONLY way back to
Mirpur is to walk onto the Agargaon platform and press E. There is no
quick-travel for it, while every station inside the district has one. The
same is true in reverse: from Mirpur there is no key that takes you to
Bijoy Sarani, only the Mirpur 10 platform gate.

## What to do

1. In `src/districts.js`, give each district that has a `gateway` a
   first-class cross-district jump. The `gateway` entry already carries
   everything needed (`to`, `arrive`, `via`, `viaBn`, `label` via the
   destination district's own `label`) — prefer deriving from it over
   duplicating those strings into a new field. Add a new field only if
   deriving genuinely does not work, and say why in your write-up.

2. In `src/main.js`, put it on the next free digit slot after the station
   jumps and the `destinations` jumps (so: Digit7 on the north map, Digit8
   on bijoy — compute it, do not hardcode either number), and add it to
   the start card's "Jump to" line with wording that makes clear it LEAVES
   this map, e.g. `8  Mirpur — Pallabi (by metro)`.

3. **Reuse the existing through-service modal.** Pressing the key must open
   the SAME confirmation popup the platform gate opens (`openGatewayModal`
   already builds its title, body and buttons from a gateway object), so
   the player is told which stations are skipped and can back out. Do not
   travel silently on a keypress — it reloads the page, and an unannounced
   reload reads as a crash.

4. While you are in there: the modal's "Stay here" button and Esc must
   still work, and the key must be a no-op in a district with no gateway
   (`old`).

## Acceptance

- On the north map, the new digit opens the popup offering Bijoy Sarani.
- On the bijoy map, the new digit opens the popup offering Mirpur, and
  confirming lands on the Mirpur 10 platform (`?district=north&arrive=...`).
- The start card lists it on both maps.
- `npx vite build` passes.
- Append a P13-E section to `docs/BIJOY-DISTRICT.md`.
