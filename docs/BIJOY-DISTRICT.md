# Bijoy Sarani district — pass notes

This file is appended to by each executor working on the Bijoy Sarani
district / multi-district split (P12-*). Add a new section per pass; don't
rewrite earlier sections.

## P12-B — `excludeIds` in city.js, and the district gate in stationlife.js

Scope: `src/city.js`, `src/stationlife.js` only. `src/main.js` / `index.html`
wiring belongs to the concurrent P12-A pass and is not in this section.

### Task 1 — `buildBuildings(..., opts.excludeIds)`

`buildBuildings` now accepts an optional `opts.excludeIds` (any iterable of
OSM ids). In the single loop that buckets `scene.buildings` into tiles
(the loop that also runs `getClippedFootprint` and `isFarBuilding` and is
the only place a building enters `tiles`/`tileBuckets`), a building whose
`id` is in `excludeIds` is `continue`d past before any of that runs. That
loop is the sole entry point into the near/far tile buckets that geometry,
rooftop props, emissive windows, the far-LOD box, and `stats` are all built
from, so excluding a building there means it produces none of them — there
is nothing downstream in `buildBuildings` that revisits `scene.buildings`.

`excludeIds` is converted to a `Set` once per call (`opts?.excludeIds ? new
Set(...) : null`) so the multi-record relation case in the brief (OSM
relation 18085267, the Parliament House, emitted as two records — the ring
of blocks and the assembly chamber — sharing one `id`) is excluded
correctly: both records fail the `Set.has` test and both get skipped, which
an index-based skip (skip the Nth match) or a single `find`-and-remove could
not guarantee.

**No-op check**: with `opts.excludeIds` absent, `opts?.excludeIds` is
`undefined`, so `excludeIds` is `null`, and `if (excludeIds && ...)` never
evaluates its right side — the loop body is byte-identical to before this
change (same `getClippedFootprint`/`isFarBuilding`/bucket-insert sequence,
same order). Ran `npx vite build` to confirm no syntax errors; did not spin
up the browser preview (out of scope per brief — the advisor verifies).
This was not run against the north map at runtime (no dev server, per the
brief's instruction) — the no-op argument above is a direct reading of the
control flow, not a live test.

Not handled here: `buildCollisionGrid(buildings)` (called separately by
main.js, not from `buildBuildings`) still receives the *full*
`scene.buildings` array including excluded ids, and will still build
collision edges for e.g. the Parliament House footprint via
`getClippedFootprint(undefined, b)` (which reuses whatever the shared
`footprintClipCache` computes for it on demand). The brief's Task 1 scope is
`buildBuildings` only (geometry/props/windows/LOD/stats); whether the
hand-modelled `sangsad.js` building also needs the procedural collision
edges suppressed is a main.js/collision-wiring question for P12-A or a
follow-up pass, not something changeable from inside `buildBuildings`
without also touching the `buildCollisionGrid` call site.

### Task 2 — the district gate in `stationlife.js`

`createStationLife` takes a new optional trailing argument (the file already
documents one deviation — `interior` as an extra argument beyond the
brief's original 5 — so this is the 7th positional argument, `opts`):

```js
createStationLife(scene3, metro, walkable, collision, player, interior, {
  gateway: { station: 'Mirpur 10', label: 'Bijoy Sarani', onBoard: () => {} },
})
```

Added:
- `findGatewayCandidate(player)`: true only when `opts.gateway` was given,
  the player is not riding, `metro.stations` has a station named
  `gateway.station`, `player.feetY` is within `GATEWAY_FEET_TOL` (1 m) of
  `METRO.DECK_Y` (platform level, not the street below), and the player's
  station-local position (via the module's own `worldToLocal`) is within
  `BOARD_RANGE` of either platform centreline (`platformCx(1)` or
  `platformCx(-1)`) and within `METRO.PLATFORM_LEN / 2` of the station
  centre along the platform.
- In `update()`: the gate is only ever checked in the `else` branch after
  `findBoardCandidate(player)` has already come back empty — a real
  berthed train always wins, per the brief. When active, `state.atGateway`
  is set to `gateway.label`, the hint line becomes `` `E: through train to
  ${gateway.label}` ``, and a `state.interactables` entry is pushed (same
  shape as the existing boarding prompt: `position`, `label`, `range`,
  `action`). `state.atGateway` is reset to `null` at the top of every
  non-riding/non-gateway path, and is never set while `state.riding` (the
  gate branch is unreachable in that case, and `findGatewayCandidate` also
  checks `state.riding` itself as a second line of defence).
- In `interact()`: after the existing board-candidate check fails, calls
  `gateway.onBoard()` and returns `true` if `findGatewayCandidate(player)`
  is truthy, else falls through to the existing `return false`.

**Restructured, not just extended, the top of `update()`**: the old
early-return (`if (!trainsRaw) { ...; return ''; }`) would have made the
gate unreachable whenever `metro.trains` hasn't landed yet, which has
nothing to do with whether a district gate should be offered. The
train-state sync (`trainStates`/`lastSnaps`/`state.trains`) is now inside an
`if (trainsRaw) { ... } else { state.trains = []; }`, and the
board/gateway/riding logic that used to sit after the early return now
always runs.

**No-op check for this restructuring**: with `opts.gateway` absent,
`gateway` is `null`, so `findGatewayCandidate` returns `null` immediately on
its first line in every call. That means: in the `trainsRaw` branch,
nothing changed (same code, just moved into the `if`). In the *no-trains*
branch specifically — the only branch whose control flow actually changed —
`state.trains` still ends up `[]` (was set directly before via early
return; now set the same way, just not immediately followed by `return`).
Falling through, `state.riding` is whatever it already was (unaffected by
either branch); if not riding, `findBoardCandidate` sees `trainStates` at
whatever it already was ([] on a fresh instance, since it's never touched
inside the `!trainsRaw` branch) and returns `null` exactly as it always
did with no trains; `findGatewayCandidate` returns `null` immediately since
`gateway` is `null`. So `line` stays `''`, `state.interactables` stays `[]`,
`state.hint` stays `''`, and the return value is `''` — identical to the
old early return's `state.trains = []; state.hint = ''; return '';` in
every observable field. Confirmed by reading the control flow line by line
(no dev server per the brief); also ran `npx vite build` to catch any
syntax mistakes.

`state.atGateway` is a new field, so its presence doesn't itself break
anything reading `state`, but it is worth noting: it is added to the state
object unconditionally, and is `null` on the north map both because
`opts.gateway` is never passed there (P12-A's concern, not this file's) and
because `findGatewayCandidate` short-circuits on `!gateway`.

### On "why the gate is on the platform, not mid-ride"

Agreed with the brief's reasoning and did not touch `metro.js`. One thing
worth flagging for whoever wires up P12-A/main.js: because
`findGatewayCandidate` doesn't care about `state.riding`'s history (only
its current value) or about a `nextStopName`, it will also fire for a
player who arrives at `gateway.station`'s platform from the *other* end of
the line (e.g. walking to Mirpur 10 from the Pallabi side) — the brief's
"southbound is unreachable" limitation is about the train ride, not about
standing on the platform, so this seems consistent with the intent (the
gate represents "you can catch a through train here", which is true
regardless of which direction the player walked in from), but flagging it
explicitly in case that's not what was wanted.

### Verified

- `npx vite build` (`npm run build` equivalent): succeeds, no errors,
  output unchanged in size/shape from before this pass (single JS chunk,
  same warning about chunk size that predates this change).
- Did not use the browser preview tools or start a dev server, per the
  brief.
- Did not run `git commit`.

### Still open

- The `buildCollisionGrid` follow-up noted under Task 1 above (excluded
  buildings still get procedural collision edges).
- Runtime confirmation that `state.atGateway` reads `'Bijoy Sarani'` on the
  Mirpur 10 platform and `null` elsewhere is the advisor's job per the
  brief (no browser tools here) — the above is a static-analysis argument
  for correctness, not a live-tested one.

## P12-A — district wiring in main.js and index.html

Scope: `src/main.js`, `index.html` only (plus this file). Read P12-B's
section above first — its `excludeIds` and gateway-option work landed
before this pass started, so both contracts described in the brief as
"may not be there when you start" were in fact already there; nothing here
had to degrade gracefully for a missing feature.

### Item 1 — district selection

Replaced the `sceneParam`/`useNorthScene`/`sceneUrl` block with
`const { district, arriveStation } = resolveDistrict();`. `district.scene`
is fetched directly; `district.loadingLabel` replaces the old inline
ternary in the first `progress()` call. `district` and `arriveStation` are
exposed on `window.__mirpur`, plus `openGatewayModal` (for the advisor to
force the through-service popup open without having to actually board a
train). Did not add a separate `?scene=` fallback — `resolveDistrict()`
already handles `?district=`, `?scene=north`/`?scene=old`, and the
`mirpurDistrict`/`mirpurScene` localStorage keys, so main.js only ever
calls it once.

### Item 2 — excluding the Parliament from the procedural pass

`buildBuildings(...)` gets `excludeIds: SANGSAD_IDS` when
`district.landmark === 'sangsad'` (only true for `bijoy` today).
Separately, `buildCollisionGrid(...)` — a different call, over a different
copy of the array — now receives `scene.buildings.filter((b) =>
!SANGSAD_IDS.includes(b.id))` under the same condition. This is exactly the
gap P12-B's section flagged as unresolved ("whether the hand-modelled
sangsad.js building also needs the procedural collision edges suppressed is
a main.js/collision-wiring question for P12-A"): it does, and it's done —
without this, the Parliament would have carried an invisible procedural box
collider sized to its own footprint sitting behind/inside the real
screen-wall colliders `sangsad.colliders` adds.

### Item 3 — the landmark itself

`buildSangsad(scene)` is called (only when `district.landmark === 'sangsad'`,
to avoid scanning `scene.buildings` needlessly on other districts —
`buildSangsad` itself is null-safe on any scene without the footprint) and
`sangsad.group` is added to `scene3` next to `landmarks.group`.
`collision.addSegments(sangsad.colliders)` runs right after
`collision.addSegments` is wired (before `ingestSceneColliders`, though
nothing here depends on that particular ordering — just wanted it visually
adjacent to where the grid's exclusion is explained). `sangsad?.
setNightIntensity(v)` was added into the existing
`night.wallMaterial.setNightIntensity` shim alongside `landmarks`/
`frontage`. `sangsad.setNightIntensity` is a documented no-op in
sangsad.js's own return value ("concrete has no lit signage"), so this call
is inert on every district including Bijoy Sarani today, but wiring it in
means a future emissive treatment on that building doesn't need a second
main.js change to reach the night system.

### Item 4 — spawn

Three branches, in priority order, replacing the old unconditional Mirpur
12 hardcode:

1. `arriveStation` set (arrived via `travelTo()`): resolved to a
   `metro.stations` entry, positioned on that station's platform
   centreline (station-local frame duplicated inline the same way
   stationlife.js documents doing — `interior.js`'s private helpers aren't
   importable, and stationlife.js's own copies are also module-private, so
   this is a second, smaller duplicate: just the `localToWorld`-style
   offset math, not the whole coordinate-helper pair). `player.flying =
   false`, `player.teleport(x, z, METRO.DECK_Y + 1.68, yaw)` (which sets
   `feetY = METRO.DECK_Y` because `EYE_HEIGHT === 1.68` — verified in
   player.js rather than assumed), then `interior.update(0, player)` three
   times before the frame loop starts, per the brief.
2. Else `district.spawn` (today only `north`'s Mirpur 12 spot): used
   verbatim, comment preserved next to it near-verbatim from the original.
3. Else `stationApproach(fallbackStation, -1, startYaw)` off
   `district.spawnFallbackStation` — the old single-station fallback,
   generalised.

The facing direction for case 1 uses `startYaw` (the district's own
primary -> secondary station bearing, see item 5) rather than re-deriving
a corridor direction from the arrival station alone: the brief's "face
them along the corridor" is exactly what `startYaw` already means for this
district, so no new trig was needed.

The pre-warm loop was already parameterised on `startSpot.x/z` and needed
no change — it now warms around whichever of the three branches ran. The
initial-streamed-radius point handed to `buildBuildings`/`buildTraffic`/
`buildPedestrians` (`spawnRaw`) is a *separate*, earlier computation over
the raw (pre-`buildMetro`) scene JSON, using the same three-way priority
but looked up by name against `scene.metro.stations` instead of
`metro.stations` — `buildMetro()` hasn't run yet at that point in the
sequence, same constraint the original code had with `mirpur10Raw`.

### Item 5 — generalising the hardcoded stations

`mirpur10`/`mirpur11`/`pallabi` are gone. In their place:
`district.quickTravel` (e.g. north's `['Mirpur 10', 'Mirpur 11', null,
null, 'Pallabi', 'Uttara South']`, Bijoy's `['Bijoy Sarani', 'Agargaon',
null, null, 'Farmgate', null]`) drives `stationForDigit(i)` ->
`metro.stations` lookup by name. `primaryStation` = `quickTravel[0]`
(falls back to `metro.stations[0]` if somehow missing), `secondaryStation`
= `quickTravel[1]` (or `null`). `startYaw`/`along`/`across` — and
therefore `stationApproach()`, Digit1/Digit2, and Digit5/Digit6's
`stationForDigit(4)`/`stationForDigit(5)` — are all now expressed in terms
of `primaryStation`/`secondaryStation` instead of the old literals.
Digit3 (platform) and Digit4 (aerial) intentionally ignore `quickTravel`'s
own index-2/3 holes and always key off `primaryStation`/`secondaryStation`
directly, exactly as the brief specifies. Confirmed by inspection that
`north`'s array reproduces the original digit bindings exactly (Digit1 ->
Mirpur 10, Digit2 -> Mirpur 11 if present, Digit5 -> Pallabi, Digit6 ->
Uttara South) and that `old`'s two-entry array leaves Digit5/6 as no-ops,
matching the pre-existing "on the old two-station scene these are no-ops"
comment.

### Item 6 — the through-service popup

New `#gateway` markup in `index.html` (hidden by default), styled to match
`#start`/`#help` (dark panel, teal primary button) via a new CSS block
reusing the existing `--panel`/`--edge`/`--teal`/`--dim` custom properties
rather than introducing new ones. In main.js:

- `const gateway = district.gateway ? gatewayAt(district, district.gateway.station) : null;`
  — trivially equal to `district.gateway` for a district with one gateway,
  but goes through the registry's own lookup as the brief asks, so it stays
  correct if a district ever grows more than one gateway station.
- `createStationLife(..., { gateway: gateway ? { station, label, onBoard } : undefined })`.
  `label` is `DISTRICTS[gateway.to]?.label` (falling back to
  `gateway.towards` if the destination key is ever missing from the
  registry, which should not happen but costs nothing to guard).
  `onBoard` calls `openGatewayModal(gateway)`.
- `openGatewayModal(gw)` sets the title (`Through train to <label>`), the
  body text, and the Ride button's label, then un-hides `#gateway` and
  drops pointer lock (same pattern as `setMapExpanded`).
- Body wording: `joinVia(gw.via, gw.viaBn)` renders each skipped station as
  `English (বাংলা)` when a Bengali name is available, joined "a, b and c",
  then: `` `This train runs through ${viaText} without stopping — ${stationsAre} not built yet. Next stop ${destLabel}${landmarkNote}.` ``.
  `landmarkNote` is `, for the National Parliament House` only when the
  *destination* district's `landmark === 'sangsad'` (i.e. only on the
  north -> bijoy direction), computed from the registry rather than
  hardcoded to a district key, so the wording doesn't need touching if a
  future district also carries a named landmark worth calling out.
  For north -> bijoy this renders byte-for-byte close to the brief's own
  example line (stations, "not built yet", "Next stop Bijoy Sarani, for
  the National Parliament House").
- Ride button click: `travelTo(gateway.to, gateway.arrive)`. Stay button
  and Escape both call `closeGatewayModal()` (Escape checks the gateway
  modal before the whole-map view, so the two overlays each Esc away in the
  right order if somehow both were open). The canvas's own click-to-lock
  handler also checks the modal is hidden before requesting pointer lock,
  so clicking through it doesn't relock the mouse behind the buttons.

### Item 7 — help text

Only the `#start` card's "Jump to" line named specific stations (`#help`'s
own "Jump" line only lists digit keys, not names, so it was already
accurate on both maps and untouched). Gave that `<dd>` an `id="quick-travel"`
and rebuilt its `innerHTML` at runtime from the same `quickTravel` array
that drives the digit keys, so the two can never drift apart. Confirmed by
hand that north's rebuilt string is character-identical to the original
hardcoded text (`1 Mirpur 10 · 2 Mirpur 11 · 5 Pallabi · 6 Uttara South ·
3 platform · 4 aerial`, `debug-only` span included).

### Known gaps / not done

- The `#start` card's descriptive paragraph ("A walkable and drivable
  reconstruction of the Mirpur corridor... Mirpur 10, Mirpur 11, Pallabi
  and Uttara South") and the `#topbar` title ("Mirpur corridor") are still
  static text naming the north map specifically. The brief's item 7 only
  calls out the help panel, so these were left alone rather than guessed
  at — they will read oddly (though not functionally break anything) when
  `?district=bijoy` is loaded directly rather than arrived at by train.
- `docs/BIJOY-DATA.md`'s own "known follow-ups" (no satellite heights for
  the Bijoy extract; the emitted metro tracks running 13 km past both ends
  of the playable area) are unrelated to this pass's scope and untouched.
- Not verified live in a browser (forbidden by the brief — the advisor
  verifies). Everything above is a static-analysis argument: read the
  contracts in `districts.js`/`sangsad.js`/`stationlife.js` as they landed,
  traced every reference to the removed `mirpur10`/`mirpur11`/`pallabi`/
  `sceneUrl`/`useNorthScene` identifiers to confirm none survived, and
  confirmed `npx vite build` succeeds with no new warnings beyond the
  pre-existing single-chunk-size one.
- The side (`-1`) chosen for the metro-arrival platform spawn position is
  arbitrary (either platform edge is a legitimate arrival point per the
  brief's own note in the stationlife.js contract) — not validated against
  which side a real northbound/southbound train would actually berth on,
  since that pairing isn't part of any contract this pass owns.

### Verified

- `npx vite build`: succeeds, single JS chunk (855.96 kB, pre-existing
  size warning unchanged), no new errors or warnings.
- Grepped for every old station literal (`mirpur10`, `mirpur11`, `pallabi`,
  `mirpur10Raw`, `pallabiRaw`, `sceneUrl`, `sceneParam`, `useNorthScene`)
  post-edit: none remain in `src/main.js` except the unrelated
  `street-pallabi.json` frontage-data filename, which is Mirpur-12-specific
  real-world data intentionally left as a best-effort fetch (already
  404-tolerant) rather than part of the district system.
- Did not start a dev server or use the browser preview tools, per the
  brief. Did not run `git commit`.

## P13-D — Pallabi as the default, and a direct endpoint to the Parliament

Owner, 2026-09-08: "make pallabi default! plz" and "add a endpoint in
there to parlament directly!" Scope: `src/main.js` and `src/districts.js`
only.

### 1. Pallabi is the default

**The sticky-district bug (item 1a).** `travelTo()` used to write the
destination district into `localStorage.mirpurDistrict` on every ride, and
`resolveDistrict()` read that key back before falling to `'north'`. So the
FIRST time a player rode the through-service to Bijoy Sarani, that
`localStorage` key was permanently set to `'bijoy'` — and every later plain
load of the game (typing the bare URL, a bookmark, a fresh tab with no
query string at all) read that leftover key and booted straight into Bijoy
Sarani again, with nothing in the visible URL to explain why. That is what
the owner almost certainly hit, since "make pallabi default" only makes
sense as a complaint if the game was *not* landing in the default district
on a fresh load.

Fix: `resolveDistrict()` no longer reads `localStorage` at all — its
fallback chain is now just `?district=` -> `?scene=` (legacy alias) ->
`'north'`. `travelTo()` no longer writes to `localStorage` either, since
nothing reads it any more; the query string it sets on the reload is the
only thing that decides the destination, exactly as it already was for the
explicit-link case. Concretely: with `localStorage.mirpurDistrict ===
'bijoy'` and no query string, `resolveDistrict()` computes `wanted =
params.get('district') /* null, no query string */ || params.get('scene')
/* null */ || 'north'`, so `wanted` is `'north'` regardless of what is
sitting in storage, and `DISTRICTS['north']` is returned — Pallabi. The
explicit-arrival case is untouched: `?district=bijoy&arrive=Bijoy%20Sarani`
still sets `wanted = 'bijoy'` from the query param before `localStorage`
would ever have been consulted, since the param check short-circuits first.

**Pallabi as the primary station (item 1b).** The hand-picked north spawn
coordinate itself (`{x:-262, z:-1466, yaw:0.25}`, the owner's own Street
View shot between the Mirpur 12 bus stand and Pallabi station) is kept
exactly as it was — it wasn't the problem. What changed is
`north.quickTravel`, which used to be `['Mirpur 10', 'Mirpur 11', null,
null, 'Pallabi', 'Uttara South']`. Slot 0 (which drives `primaryStation`,
Digit1, the aerial/platform presets' anchor, and the start-facing
calculation) and slot 4 (Digit5) were swapped, giving `['Pallabi', 'Mirpur
11', null, null, 'Mirpur 10', 'Uttara South']`. Mirpur 10 and Mirpur 11 are
both still reachable by digit key (5 and 2 respectively) — neither was
deleted, just moved — and the HUD's "Jump to" line (`#quick-travel`, built
in `main.js` from this same array so it can't drift) now reads "1 Pallabi
· 2 Mirpur 11 · 5 Mirpur 10 · 6 Uttara South" on the north map.

### 2. A direct endpoint to the Parliament

The district registry gained a third kind of place, alongside metro
stations and the hand-picked street spawn: **named destinations** — `{
key, name, bn, x, z, y, yaw }` — for landmarks worth a direct jump that
aren't stations. `bijoy.destinations` carries one entry for the Jatiya
Sangsad Bhaban / জাতীয় সংসদ ভবন:  `(1192, 5920)`, eye height, yaw 0.

`src/sangsad.js` was checked for an exported viewpoint before this landed
(read, not edited, per the brief) — its only export is `SANGSAD_IDS`, so
the coordinate lives in `districts.js` as the brief allows when that's the
case. The advisor's candidate number was checked against
`public/scene-bijoy.json` rather than trusted blindly: the real footprint
for OSM relation 18085267 (`SANGSAD_IDS[0]`) spans x 1120.7-1271.4, z
635.9-5810.0 (script: iterate `scene.buildings.find(b => b.id ===
18085267).p`, a flat `[x,z,x,z,...]` array, min/max each axis) — centre
(1196, 5723), south edge at z=5810. `(1192, 5920)` sits ~110 m south of
that edge, on the Manik Mia Avenue side, well clear of the building. Yaw 0
is `-Z`/north in this project's frame (`Player.forward()` returns
`(-sin(yaw), 0, -cos(yaw))`; the header comment says `+Z south`), so yaw 0
at a point south of the building looks straight at its south facade — the
"classic" elevation view the brief asked for.

Wiring in `main.js`: a small `digitForDestination(dest)` helper places
each district's destinations right after its `quickTravel` station slots —
`quickTravel.length + index + 1`, i.e. Digit7 today, since both districts'
`quickTravel` arrays are fixed at 6 slots. `Digit7`'s handler teleports
on-foot (`player.flying = false`) to the destination's own `{x, z, y,
yaw}`, defaulting `y` to 1.68 (eye height, matching every other on-foot
teleport in this file) and `yaw` to 0 if omitted. The same `destinations`
array feeds the "Jump to" line alongside the station entries, printing the
real name with the Bengali alongside it — `Jatiya Sangsad Bhaban (জাতীয়
সংসদ ভবন)` — never "Parliament", using the same name/bn pairing style
`joinVia()` already uses for the gateway's via-station list. On the north
map, `district.destinations` is `undefined`, so this whole block is a
no-op and Digit7 does nothing there, same as it always did.

### Verified

- `npx vite build`: succeeds, single JS chunk (856.24 kB, pre-existing
  size warning unchanged), no new errors or warnings.
- Reasoned through `resolveDistrict()` by hand for the acceptance case
  (`localStorage.mirpurDistrict === 'bijoy'`, no query string) rather than
  running it in a browser, per the brief — see the walkthrough above.
- Checked the Parliament footprint's real bounding box against
  `public/scene-bijoy.json` with a one-off Node script rather than trusting
  the advisor's coordinate as given.
- Grepped for `mirpurDistrict` / `mirpurScene` post-edit: only survives in
  this file's own prose and `districts.js`'s explanatory comment; no code
  reads or writes either key any more.
- Did not start a dev server or use the browser preview tools, per the
  brief. Did not touch `src/minimap.js`, `index.html`, `src/sangsad.js`,
  `src/city.js`, `src/stationlife.js`, or any scene file. Did not run `git
  commit`.

## P13-E — Cross-district jump (owner, live, 2026-09-08: "cant jumb to mirpur!")

Once in Bijoy Sarani, the only way back to Mirpur was to walk onto the
Agargaon platform and press E — no quick-travel key, unlike every station
inside the district. Same problem in reverse from Mirpur to Bijoy Sarani.

Added `gatewayJump(district)` to `districts.js`: a small pure function that
turns `district.gateway` into a quick-travel-shaped `{ label, arrive,
gateway }` — `label` from `DISTRICTS[gateway.to].label` (falling back to
`gateway.towards`), `arrive` straight off the gateway, and `gateway` itself
passed straight through so `main.js` can hand it to `openGatewayModal()`
unchanged. Nothing new is stored on the district: everything it derives
from (`to`, `arrive`, `via`, `viaBn`, the destination's own `label`) already
lived on `gateway`, and duplicating those strings onto a second field would
just be a second place for them to drift out of sync with the real
platform gate — the brief's own preference, and it held up fine in
practice, so no new field was needed.

Wiring in `main.js` mirrors `digitForDestination()`'s pattern exactly:
`gatewayDigit = quickTravel.length + destinations.length + 1`, i.e. the
next free slot after both the station jumps and any named destinations —
computed, never hardcoded, so it stays correct if either array grows.
Today that lands on Digit7 on the north map (0 destinations there) and
Digit8 on bijoy (1 destination, Jatiya Sangsad Bhaban, already occupies 7).
Because a computed digit can't be a `switch` `case` label, the check runs
as an `if` immediately before the switch, ahead of every other digit
handler, comparing against `` `Digit${gatewayDigit}` ``; it returns early
so the switch never also sees the keypress. Pressing it calls
`openGatewayModal(crossDistrictJump.gateway)` — the exact same function
the platform gate's `onBoard` callback calls — so the player gets the same
"through train, skips X, Y, Z" copy and the same Ride/Stay buttons/Esc
either way, never a silent reload. `crossDistrictJump` is `null` on the
`old` district (no `gateway`), which makes the key a plain no-op there for
free, no extra guard needed.

The "Jump to" start-card line gets one more entry, appended after the
destinations loop: `` `${label} — ${arrive} (by metro)` ``, e.g. "Mirpur —
Mirpur 10 (by metro)" on the bijoy map — deliberately not just the bare
station name, so it doesn't read as "just another stop" the way the
station and destination entries do. On the north map `label` and `arrive`
are both literally "Bijoy Sarani" (the gateway arrives at the district's
only modelled station of that name), so the arrival half is dropped to
avoid a stutter and the line just reads "Bijoy Sarani (by metro)".

### Verified

- `npx vite build`: succeeds, no new errors or warnings.
- Reasoned through the digit-key wiring by hand for both districts: north
  (`quickTravel.length` 6, `destinations.length` 0) puts the gateway on
  Digit7 and opens the modal offering Bijoy Sarani; bijoy (`quickTravel
  .length` 6, `destinations.length` 1) puts it on Digit8 and opens the
  modal offering Mirpur, whose Ride button calls `travelTo('north',
  'Mirpur 10')` — landing on the Mirpur 10 platform via `?district=north
  &arrive=Mirpur%2010`, matching the acceptance criteria.
- Confirmed Esc and the "Stay here" button still close the gateway modal
  regardless of which caller opened it (`closeGatewayModal()` and the Esc
  handler are unchanged and don't know or care who called
  `openGatewayModal`).
- Did not start a dev server, use the browser preview tools, or run `git
  commit`, per the brief. Touched only `src/main.js`, `src/districts.js`,
  and this file.
