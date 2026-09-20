# Road surface observations (Dhaka / Mirpur Road / Rokeya Sarani)

Sources: see `SOURCES.md`. Pixel means below are sampled crops (Python/PIL),
not full-frame averages, so they are indicative, not lab-accurate — but the
ordering and hue direction between samples is reliable and is what matters
for retuning the game's asphalt textures.

## Value / lightness

Dhaka asphalt is **mid-to-dark warm grey**, never near-black overall (that
reading only appears in deep shadow or on a fresh patch) and never pale
grey/white except where directly sun-bleached and heavily dust-covered.
Sampled means:

- `mirpur_road_2_wikimedia.jpg`, main carriageway in dusk/shade light:
  rgb(102,100,103) → **#666467** — closest to a "clean, slightly damp or
  recently used" mid grey, very low warmth (evening light desaturates it).
- `26_arc_of_metro_bridge_at_dhaka_jpg.jpg`, carriageway in open daylight
  under/near the viaduct: rgb(126,114,109) → **#7d726c** — warmer and
  lighter than the dusk sample; this is the "typical dry daytime" case.
  Same photo's shaded gutter/edge: rgb(98,80,69) → **#614f45**, browner and
  darker (wet-look shadow + dust).
- `dhaka_roads_01_wikimedia.jpg`, painted grid intersection in full midday
  sun: rgb(172,147,129) → **#ac9381** — the lightest reading in the set,
  i.e. the "sun-bleached, heavily dusted" end of the range. Treat this as
  an upper bound, not the default — it's a bright-exposure photo of a
  specific junction, not the typical tone of a travelled lane.
- `01_mirpur_10_metro_station_jpg.jpg`: not usable, road mostly out of frame.

**Conclusion:** the previous procedural base (`#5a5856`, ~rgb(90,88,86),
neutral grey) was in the right value range but too *neutral* — real Dhaka
asphalt leans warm/brown, not grey-blue. Retune toward warm mid-dark greys
in the `#5a5048`–`#6b6058` band for the base fill, reserving the lighter
`#8a7c68` family only for the dust-film overlay near edges, not the bulk
surface.

## Approximate hex palette to build from

- Fresh asphalt / patch repair (darkest): **#2a2724** (near-black, warm)
- Base "typical" asphalt fill (most of the road): **#5c5249** (this pass's
  new procedural base — see Part 2 below)
- Wheel-track bands (polished/oiled, darker than base): **#443d36**
- Sun-bleached / heavily dust-covered patches: **#8f8171**
- Dust film accumulating toward the road edges: **#8a7658**, blending into
  the existing bare-ground colour `COLORS.ground = #9a9184`
- Fine gravel/grit speckle: scattered pixels across **#3a332d** to
  **#7d7264** (both darker and lighter than base, i.e. real noise, not a
  uniform tint)
- Faded lane paint: warm off-white/cream **#cfc6a8** at low opacity
  (worn), not pure white — see Lane markings below

## Edge condition

No continuous kerb in most of what's visible: in `26_arc_of_metro_bridge`
the asphalt simply crumbles into a dirt/rubble shoulder in front of the
shopfronts (posters, loose stones, no raised lip). Where a kerb exists
(`mirpur_road_2_wikimedia.jpg`, the arterial with a proper central
reservation) it's a low painted concrete edge, not a tall modern kerb. The
game's corridor already models low kerbs (`0xb9b3a6`, 0.15 m) between
carriageway and footpath, which is reasonable for the purpose-built
corridor road even if ordinary residential/secondary streets nearby would
more often just dissolve into dirt — leaving that geometry as-is, this pass
only retunes materials/textures, not the kerb mesh.

## Lane markings

Condition varies a lot by road: `dhaka_roads_01_wikimedia.jpg` shows a
fairly fresh yellow box-grid plus a white dashed centre line at a
signal-controlled junction — clearly maintained, still saturated colour.
`mirpur_road_2_wikimedia.jpg` shows a plain white dashed centre line on the
open arterial, fainter and lower-contrast against the asphalt. Away from
junctions (most of the corridor and the OSM residential/secondary grid),
markings read as heavily faded, broken, dusty cream rather than crisp
white — matching the existing `asphaltTexture()` intent, just needs less
uniform/less crisp dashes and a warmer, dustier paint colour than the
previous `rgba(215,205,170,0.30)`.

## Median / divider

`mirpur_road_2_wikimedia.jpg` shows a yellow/black-striped low concrete
median barrier on the open arterial. The metro corridor in this project
uses a planted green median strip instead (piers stand in it), which is
correct for the MRT Line 6 alignment specifically (matches
`reference/metro/photos` station-area photos) — no change needed there.

## Wet/dry, dust and litter

All reference photos are dry-season / dry-road conditions — no visible
standing water or wet-asphalt specular sheen. Dust is the dominant surface
condition, heavier at the edges and in the gutter than in the wheel-worn
centre of each lane, with visible litter and loose stone rubble at the
shoulder in `26_arc_of_metro_bridge_at_dhaka_jpg.jpg`. This supports adding
an edge-biased dust gradient in the procedural texture rather than a
uniform dust tint across the whole tile.
