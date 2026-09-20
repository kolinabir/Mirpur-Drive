# P12-A — Wire the Bijoy Sarani district into main.js

**You own: `src/main.js`, `index.html`. Nothing else.**
Another executor (P12-B) is editing `src/city.js` and `src/stationlife.js`
in parallel — do not touch those two files, and do not "fix" them if they
look unfinished. Do NOT use the browser preview tools (shared, throttled);
the advisor verifies and takes screenshots. Do not commit.

## Context

The map is now a set of DISTRICTS. Two new modules already exist and are
finished — read them first, they carry the design rationale:

- `src/districts.js` — the registry (`DISTRICTS`, `resolveDistrict`,
  `travelTo`, `gatewayAt`). Explains why a district swap is a page reload.
- `src/sangsad.js` — the hand-modelled Jatiya Sangsad Bhaban
  (`buildSangsad(scene)`, `SANGSAD_IDS`).
- `public/scene-bijoy.json` — the new scene (6,280 buildings, 1.07 MB),
  stations `Agargaon`, `Bijoy Sarani`, `Farmgate`. See `docs/BIJOY-DATA.md`.

## Contracts you can rely on (other executor is implementing these)

```js
// src/city.js — P12-B adds this option, it may not be there when you start:
buildBuildings(scene, facadeTex, roofTex, emissiveTex, {
  start, initialRadius,
  excludeIds,   // NEW: iterable of OSM ids to skip entirely. Optional.
});

// src/stationlife.js — P12-B adds an OPTIONAL 7th argument:
createStationLife(scene3, metro, walkable, collision, player, interior, {
  gateway: {
    station: 'Mirpur 10',       // station whose platform offers the service
    label:   'Bijoy Sarani',    // where it goes, for the prompt text
    onBoard: () => { ... },     // called when the player presses E there
  },
});
```
Both are additive and safe to pass before P12-B lands (an older build just
ignores the extra argument). Write your code as if they are there.

## What to do

1. **District selection.** Replace the `sceneParam` / `useNorthScene` /
   `sceneUrl` block (around `src/main.js:130-140`) with
   `resolveDistrict()`. Keep `?scene=north` / `?scene=old` working — the
   registry already handles that alias, so do not add your own. Fetch
   `district.scene`. Use `district.loadingLabel` in the progress line.
   Expose `district` and `arriveStation` on `window.__mirpur`.

2. **Exclude the Parliament from the procedural extruder.** When
   `district.landmark === 'sangsad'`, pass `excludeIds: SANGSAD_IDS` to
   `buildBuildings`, AND filter the same ids out of the array handed to
   `buildCollisionGrid(scene.buildings)` — that call is separate and would
   otherwise leave an invisible box in the collision grid.

3. **Build the landmark.** `const sangsad = district.landmark === 'sangsad' ?
   buildSangsad(scene) : null;` — it returns `null` harmlessly if the scene
   has no Parliament footprint. Add `sangsad.group` to `scene3` next to
   `landmarks.group`. After `collision.addSegments` is wired (it is wired a
   few lines below `buildCollisionGrid`), call
   `collision.addSegments(sangsad.colliders)` so the player cannot walk
   through it. Include `sangsad.setNightIntensity(v)` in the existing
   `wallMaterial.setNightIntensity` shim alongside `landmarks`/`frontage`.

4. **Spawn.** Today the spawn is hardcoded to Mirpur 12 / Pallabi. Make it:
   - if `arriveStation` is set (the player just rode in from another
     district): stand them **on that station's platform**, walk mode. Copy
     what `stationlife.alight()` does — set `player.feetY = METRO.DECK_Y`,
     position at the platform centreline, `player.flying = false` — and call
     `interior.update(0, player)` two or three times BEFORE the first frame
     so the platform slab is registered in the walkable registry and they do
     not fall through. Face them along the corridor.
   - else if `district.spawn` is set, use it (this reproduces today's
     Mirpur 12 spawn exactly — keep the existing comment explaining it).
   - else fall back to `stationApproach(...)` on
     `district.spawnFallbackStation`.
   Pre-warm the LOD tiles around whatever spawn you end up with — that loop
   already exists, just feed it the right point.

5. **Generalise the hardcoded stations.** `mirpur10` / `mirpur11` /
   `pallabi` are looked up by literal name and used for the start yaw, the
   corridor `along`/`across` vectors and the Digit1-6 quick travel. On the
   Bijoy map those names do not exist. Drive them off
   `district.quickTravel` (an array of station names by digit, with `null`
   holes for the Digit3 platform preset and the Digit4 aerial preset, which
   should keep working off the district's FIRST station). Keep Digit1/2 on
   Mirpur 10/11 for the north map — the registry already encodes that.

6. **The through-service popup.** Add a modal to `index.html` (markup +
   CSS in the existing `<style>`, matching the game's existing panel look —
   see `#start` and `#help`). It must:
   - be hidden by default, and released from pointer lock when shown;
   - title: `Through train to <label>`;
   - body naming the stations the train does not stop at, from
     `gateway.via` / `gateway.viaBn`, worded so it is clear they are not
     built rather than not real. Something like: *"This train runs through
     Kazipara, Shewrapara and Agargaon without stopping — those stations are
     not built yet. Next stop Bijoy Sarani, for the National Parliament
     House."*
   - two buttons: **Ride to <label>** and **Stay here**.
   - Ride calls `travelTo(gateway.to, gateway.arrive)`.
   Wire `gateway.onBoard` (passed into `createStationLife`) to open it, using
   `gatewayAt(district, ...)` from the registry. Esc closes it.

7. **Help text.** `index.html`'s help panel lists "1 Mirpur 10, 2 Mirpur 11"
   etc. Make it accurate for both maps (either generic wording, or filled in
   from the district at runtime — your call, but it must not lie on the
   Bijoy map).

## Acceptance

- `?district=north` (and no query string at all) behaves EXACTLY as today:
  same Mirpur 12 spawn, same digits, no Parliament, no new prompt anywhere
  except on the Mirpur 10 platform.
- `?district=bijoy` loads `scene-bijoy.json` and spawns on the Bijoy Sarani
  platform when `&arrive=Bijoy%20Sarani` is present.
- `?scene=old` still loads the two-station map.
- No console errors on any of the three.
- Write what you did, and anything you could not do, into
  `docs/BIJOY-DISTRICT.md` (new file). Be honest about gaps.
