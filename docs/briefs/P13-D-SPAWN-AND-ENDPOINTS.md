# P13-D — Pallabi as the default, and a direct endpoint to the Parliament

**You own: `src/main.js` and `src/districts.js`. Nothing else.**
Do NOT touch `src/minimap.js`, `index.html`, `src/sangsad.js`,
`src/city.js`, `src/stationlife.js` or the scene files — three other
executors are in them right now. Do not commit. Do not use browser preview
tools; the advisor verifies.

Read `src/districts.js` and `docs/BIJOY-DISTRICT.md` first.

## 1. Pallabi is the default (owner, 2026-09-08: "make pallabi default! plz")

Two things are probably behind this, and BOTH need fixing:

a. **The district is sticky.** `travelTo()` writes the destination district
   into `localStorage.mirpurDistrict`, and `resolveDistrict()` reads that
   before falling back to `north`. So once the player has ridden to Bijoy
   Sarani, every later plain load of the game drops them in Bijoy Sarani
   with no obvious way back. That is almost certainly what the owner hit.
   **Fix:** a bare URL (no `?district=`) must always start in the default
   district. Keep the explicit query param authoritative. Remove the
   localStorage fallback for the district, or scope it so it cannot
   override a fresh visit — your call, but a plain reload of
   `http://localhost:5183/` must land at Pallabi, every time.

b. **Make the spawn Pallabi explicitly.** The north district's spawn is
   currently the Mirpur 12 street coordinate `{x:-262, z:-1466}`, which is
   between the Mirpur 12 bus stand and Pallabi station. Keep that exact
   spot if it is still the nicest view (it was chosen off the owner's own
   Street View shot — read the comment), but make Pallabi unambiguously
   the district's primary station: `quickTravel[0]` should be `Pallabi`,
   the HUD's start card should say Pallabi, and Digit 1 should go there.
   Do not delete the Mirpur 10 / Mirpur 11 jumps, just re-order.

## 2. A direct endpoint to the Parliament

Owner: "add a endpoint in there to parlament directly!"

`src/sangsad.js` builds the National Parliament House at approximately
world (1192, 5745) in the `bijoy` district. Add a first-class destination
for it:

- Extend the district registry so a district can list **named
  destinations** that are not metro stations — `{ name, bn, x, z, yaw }` —
  and give `bijoy` one for the Parliament, positioned at a good viewpoint
  on the Manik Mia Avenue side looking north at the building (the advisor
  found `(1192, 5920)` at eye height, yaw 0, gives the classic south
  elevation view; verify the number is sane against the scene, do not
  trust it blindly).
- Wire it to a digit key alongside the station jumps, and show it in the
  start card's "Jump to" line with its real name — **Jatiya Sangsad
  Bhaban / জাতীয় সংসদ ভবন** — not "Parliament".
- Do NOT hardcode the coordinate in main.js; it belongs in the registry
  next to the district it is in.

Import the viewpoint from `src/sangsad.js` if that file exports one by the
time you get there; otherwise put it in `districts.js` and say so. Do not
edit `src/sangsad.js` either way.

## Acceptance

- `http://localhost:5183/` with no query string, and with
  `localStorage.mirpurDistrict` set to `'bijoy'`, still starts in the north
  district at Pallabi. Test the localStorage case explicitly by reasoning
  through `resolveDistrict()`; you cannot use a browser.
- `?district=bijoy&arrive=Bijoy%20Sarani` still arrives on the platform.
- The Parliament digit key exists and is listed in the start card.
- `npx vite build` passes.
- Append a P13-D section to `docs/BIJOY-DISTRICT.md`.
