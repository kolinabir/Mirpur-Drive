# P13-F — Map label quality, and the missing base layer

Follow-on from P13-B, from the owner's own screenshot of the expanded map
on the `bijoy` district (2026-09-08). P13-B got the hard parts working —
labels are drawing, roads are drawing, the metro line is drawing. These are
the defects visible in that screenshot, in priority order.

**You own: `src/minimap.js`, `tools/build-overview.mjs`,
`public/map-overview.json`, `index.html`.** Do not touch `src/main.js`,
`src/districts.js`, `src/sangsad.js` or any `public/scene-*.json`.
Do not commit. Do not use browser preview tools.

## 1. The Parliament is not on the map (worst defect)

The map labels **"Shangshad Bhaban Park"** and **"Shangsad bhaban Lake"**
but NOT the National Parliament House itself — the building the entire
district was built to show. It is OSM relation **18085267**, `name:en =
National Parliament House`, `name = জাতীয় সংসদ ভবন`, at world (1192, 5745)
in `scene-bijoy.json`.

**Confirmed by the advisor live**, not inferred from the picture:
`minimap._overview.places` holds 220 entries and every one is an area or a
POI — there are NO buildings in the label source at all. Meanwhile
`scene-bijoy.json` carries **340 named buildings**, and the largest are
exactly the ones a map should name:

| name | footprint |
|---|---|
| Shaheed Suhrawardi Medical College and Hospital | 20,233 m^2 |
| Bangladesh China Friendship Conference Center | 16,650 m^2 |
| **National Parliament House** | **14,336 m^2** |
| South Plaza | 10,218 m^2 |
| National Museum of Science & Technology | 6,440 m^2 |
| North Plaza | 5,754 m^2 |

Add named BUILDINGS to `tools/build-overview.mjs` as a label source, scored
by footprint area so the big civic ones win. Give the Parliament a landmark
tier: larger type, always drawn, never culled by the collision pass. Its
Bengali name (`জাতীয় সংসদ ভবন`) is in the same record — show both, as the
station labels already do.

## 2. The base layer only covers one rectangle

**Diagnosed live.** This is zoom-dependent, and it is the cached patch:
zoomed IN (mpp 1.6) the buildings draw correctly across the whole area
including the Sangsad complex; zoomed OUT to the whole-line view they
collapse to a single band around the player. `MINI_PATCH_MPP` and the patch
bitmap it drives are the suspects.

At the whole-map zoom the loaded district must show its buildings across its
entire extent, not just a patch near the player. If rendering every
footprint at that zoom is too slow, pre-render a downsampled district
bitmap once (at load, or in `tools/build-overview.mjs`) and blit that —
but the result must not depend on where the player happens to be standing.

## 3. Duplicate labels

Visible duplicates in one screen: **"Prime Minister's Office" x2**,
**"Mirpur Road" x3**, **"Kazi Nazrul Islam Avenue" x2**, **"Begum Rokeya
Sharani" x2**. Roads are split into many OSM ways sharing a name, and POIs
are sometimes mapped twice (node + area). Deduplicate by name: one label per
named road per screen region (label the longest run, or repeat only at a
sensible on-screen interval, not once per way), and one label per named POI.

## 4. The label budget is spent on the wrong things

Drawn in the screenshot: "Field", "School Ground", "BasketBall Court",
"Resident Garden", "Mess B Pond", "Tara math", "Khelaghar Math",
"T&T Field", "Minar Mosjid Field". Not drawn: the Parliament.

Rank labels by real importance before the collision pass, and give the low
tiers a higher zoom threshold so they only appear when zoomed in:
1. hand-modelled landmarks and major civic buildings, metro stations
2. neighbourhood/area names, lakes, universities, hospitals, arterial roads
3. everything else — playgrounds, ponds, small POIs, minor roads

## 5. Overlaps still get through

"The ENT And Head-Neck Cancer Hospital And Institute" runs across a road and
into "Syed Mahbub Morshed Avenue"; "250 bedded Tuberculosis Hospital"
collides with "National Institute of Traumatology & Orthopaedic
Rehabilitation (NITOR)". Tighten the collision test (measure the real text
box including descenders, add a small padding, and test against roads/rail
too, not just other labels). When two collide, the higher tier wins.

Long names may be truncated with an ellipsis at low zoom — but never
truncate a tier-1 label.

## 6. Mirpur is still not visible on the bijoy map

The owner's words: "I cant see mirpur in the same map!". P13-B's
cross-district overview is the fix and may already be landing — verify it
actually draws the north district (Pallabi, Mirpur 10/11, Uttara South) on
the bijoy map, dimmed, with the unbuilt Kazipara/Shewrapara stretch dashed.
If the two districts' extents make one view useless, add a "fit whole line"
zoom step that frames both.

## 7. The corner minimap has no place names

Owner, 2026-09-08: "also the minimap doesnt show the places like main map
does!". The labelling pass only runs in the expanded view. Draw labels in
the collapsed corner minimap too — but at that size only the top tier
belongs there: the metro stations, and any landmark within range. Three or
four labels, not thirty. The existing collision pass should keep them off
each other.

## 8. The map hint is cut off

The bottom hint ("Whole map — click it, press M or Esc to close") is clipped
by the viewport edge. Keep it fully on screen.

## Acceptance

- "জাতীয় সংসদ ভবন / National Parliament House" is the most prominent label
  on the bijoy map, and never culled.
- No duplicate name visible twice in one view.
- Buildings render across the whole district extent, not one band.
- No overlapping label text at any zoom step.
- The corner minimap shows a few top-tier place names.
- `npx vite build` passes. Append to `docs/MAP-PASS.md`.
