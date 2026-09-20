# P12-B — `excludeIds` in city.js, and the district gate in stationlife.js

**You own: `src/city.js`, `src/stationlife.js`. Nothing else.**
Another executor (P12-A) is editing `src/main.js` and `index.html` in
parallel — do not touch those, and do not add the call sites yourself; P12-A
adds them. Do NOT use the browser preview tools (shared, throttled); the
advisor verifies. Do not commit.

Read `src/districts.js` first for why districts exist.

## Task 1 — `buildBuildings(..., opts.excludeIds)` in `src/city.js`

New optional option, an iterable of OSM ids:

```js
buildBuildings(scene, facadeTex, roofTex, emissiveTex, { start, initialRadius, excludeIds })
```

Buildings whose `id` is in `excludeIds` must be dropped **before** the tile
bucketing, so they never produce geometry, rooftop props, emissive windows or
a far-LOD box, and never count in the returned `stats`. Absent or empty
`excludeIds` must be a byte-for-byte no-op against today's behaviour — the
north map is the default map and must not regress.

Why: `src/sangsad.js` hand-models the National Parliament House (OSM relation
18085267). Without this the procedural extruder also puts a flat grey box on
the same footprint, inside the real one.

Note the scene emits that relation as **two records sharing one `id`** (the
ring of blocks and the assembly chamber) — an id filter, not an index or a
`find`, is required.

## Task 2 — the district gate in `src/stationlife.js`

`createStationLife` takes a new **optional 7th argument**:

```js
createStationLife(scene3, metro, walkable, collision, player, interior, {
  gateway: { station: 'Mirpur 10', label: 'Bijoy Sarani', onBoard: () => {} },
})
```

Behaviour:

- When the player is standing on the platform of `gateway.station` — use the
  module's existing `worldToLocal` / `platformCx` / `METRO.PLATFORM_LEN`
  helpers, and require them to be at platform level (`player.feetY` near
  `METRO.DECK_Y`), not on the street below — and there is **no** train to
  board, the interaction line becomes `E: through train to <label>`.
- Pressing E there calls `gateway.onBoard()` and returns `true` from
  `interact()`.
- **Boarding a real berthed train always wins.** The gate is the fallback
  when no train is at the platform, never a competitor to `E: board train`.
- It must be inert while `state.riding`.
- Expose it on `state` (e.g. `state.atGateway = 'Bijoy Sarani' | null`) so
  the advisor can assert it from `window.__mirpur.stationlife.state` without
  a screenshot.
- Omitting the argument entirely must change nothing.

Add an entry to `state.interactables` for it, the same shape the boarding
prompt already pushes.

## Why the gate is on the platform and not mid-ride (do not "fix" this)

`metro.js` runs every train through `stopDistances` in one ascending order,
so the chronological stop sequence is one-directional: on the north map,
riding always goes Mirpur 10 -> Mirpur 11 -> Pallabi -> Uttara South. There
is no southbound service that berths, so "ride south past Mirpur 10 and get
offered the jump" is not reachable without rebuilding the train simulation.
A platform-side gate at the district edge gives the same result honestly.
If you disagree, say so in your write-up — do not change metro.js, it is
not yours this pass.

## Acceptance

- North map with no `excludeIds` and no `gateway`: identical to today.
- `state.atGateway` reads `'Bijoy Sarani'` when standing on the Mirpur 10
  platform with no train berthed, and `null` otherwise.
- Report what you did in `docs/BIJOY-DISTRICT.md` (append; P12-A creates it —
  if it does not exist yet, create it and P12-A will append).
