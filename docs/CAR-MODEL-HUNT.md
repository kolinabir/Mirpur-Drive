# CC0 car model hunt — result, 2026-09-07 (advisor)

The owner rejected the Kenney sedan the P4-CAR executor wired in ("ugly ass
looking car"), and chose "hunt CC0 realistic glbs" over the alternatives.
This is the honest result of that hunt, written down so nobody repeats it.

## VERDICT: there is no CC0 photorealistic car that can be fetched without
## a login. Every free, directly-downloadable option is stylised low-poly.

| Source | Licence | Fetchable? | Style | Verdict |
|---|---|---|---|---|
| Kenney Car Kit (in use now) | CC0 | yes | toy low-poly, flat colormap | REJECTED by owner |
| Quaternius LowPoly Cars | CC0 | yes | same toy style | no better |
| KayKit / Poly Pizza cars | CC0 / CC-BY | yes | same toy style | no better |
| Eclair Assets "Car Kit GLB Pack, 50 free CC0" | CC0 | yes, no account | "50 low-poly models", 1.3 MB for 50 cars — so ~26 KB each, definitively low-poly | best silhouettes available, still not realistic |
| PSX Style Cars (GGBotNet) | CC0 | yes | deliberately PSX-era | no |
| Poly Haven | CC0 | yes, open API | **has no vehicles at all** (checked api.polyhaven.com/assets?t=models: furniture, props, plants, tools only) | dead end |
| Pixabay 3D | royalty-free | login-gated | only 2 realistic entries, a police car and a vintage Ford | wrong vehicles |
| Sketchfab realistic sedans | mostly CC-BY | **needs an account** — the advisor cannot download | genuinely realistic | owner could fetch one manually |
| awesome-cc0 list (madjin) | — | — | lists no CC0 vehicle source at all | dead end |

Structural reason: realistic car models are commercially valuable, and real
car designs carry trademark exposure, so they are almost never released CC0.
The CC0 world is game-asset kits, and game-asset kits are stylised.

## What actually makes the current car read as a TOY (advisor analysis)
Judged from screenshots/p4-car-parked.jpg and the owner's own screenshot,
the mesh is only part of it. Three things matter more than polygon count:
1. **No reflections.** The car uses a flat colormap on a plain material with
   no environment map. Real cars are read by the eye almost entirely through
   their reflections. A `MeshPhysicalMaterial` with `clearcoat: 1`,
   `clearcoatRoughness ~0.03`, `metalness ~0.6`, `roughness ~0.25` plus an
   env map turns the SAME low-poly mesh into something that reads as a car.
2. **Toy proportions.** Kenney bodies are short and tall. A real sedan is
   about 4.5 m long, 1.80 m wide, 1.45 m high, with a roof about 0.35 of
   total height and wheels of 0.32 m radius set at the corners. Rescaling
   the body to those numbers removes most of the "toy" impression.
3. **Flat glass.** The windscreen is an opaque light-grey panel. Real glass
   needs a dark, reflective material (low roughness, high reflectivity, or
   `transmission` if the budget allows).

## RECOMMENDATION
Take the best CC0 silhouette available (the Eclair 50-model CC0 GLB pack is
the strongest untried candidate, is 1.3 MB for fifty vehicles, needs no
account, and would ALSO supply the traffic fleet — the owner chose "fleet
matches the player car's style"), then do the three fixes above in code.
That is a far bigger visual win than continuing to hunt for a realistic glb
that, on this evidence, does not exist under CC0.

If the owner wants true photorealism, the only route is for THEM to
download a CC-BY realistic sedan from Sketchfab with their own account and
drop it into public/models/; the wiring is then a 20-minute job.

## Sources checked
- https://kenney.nl/ , https://quaternius.com/ , https://poly.pizza/
- https://eclair-assets.itch.io/car-kit-glb-pack-50-free-cc0-3d-models
- https://api.polyhaven.com/assets?t=models
- https://pixabay.com/3d-models/search/car/
- https://sketchfab.com/tags/cc0
- https://github.com/madjin/awesome-cc0

---

## THE ECLAIR PACK IS THE KENNEY KIT (advisor, 17:47, downloaded and checked)

The owner said "get that eclair pack!", so it was fetched. Getting it took
working out itch.io's real free-download flow, which is worth recording:

1. `POST https://<user>.itch.io/<slug>/download_url` with the page's
   `csrf_token` -> JSON `{url}` for a time-limited download page.
2. Load that page; the Download button carries `data-upload_id`.
3. `POST https://<user>.itch.io/<slug>/file/<upload_id>?source=game_download&as_props=1`
   with the download page's csrf_token -> JSON `{url}` for a **signed R2 URL
   that expires in 60 seconds**. Fetch it immediately.
No account, no email. (Guessing `/uploads/<id>/download` or putting the key
in the path both 404 — the working endpoint was found by clicking the real
button and reading `performance.getEntriesByType('resource')`.)

**Result: the pack is a repackaged Kenney Car Kit 3.1.** The zip's top
folder is literally `kenney_car_kit_glb_cc0_v1`, its README says "based on
Car Kit / Kenney ... not an official Kenney product", and its `sedan.glb`
is BYTE-IDENTICAL to the one already in this repo:
`md5 5fc2f2353fb3b0963e069f8fa4ef7622` for both. So it does NOT improve the
player car's looks at all — it is the same model the owner rejected.

### What it IS good for
The full vehicle set, which the traffic fleet needs (the owner chose "fleet
matches the player car's style"). Installed the useful subset into
`public/models/car-kit/` (2.0 MB, inside the 3 MB budget):
sedan, sedan-sports, hatchback-sports, suv, suv-luxury, taxi, van, truck,
delivery, delivery-flat, and three separate wheel models
(wheel-default, wheel-dark, wheel-truck) — separate wheels matter because
they can be spun and steered independently of the body.
Not installed (5.5 MB full pack): karts, race cars, tractors, firetruck,
ambulance, police, cones and crash debris — wrong for Mirpur.
Licence: CC0, Kenney, credit appreciated not required. `Kenney-License.txt`
and `MODEL_LIST.csv` copied in alongside.

### CONCLUSION, unchanged and now proven
Every CC0 route leads back to the same handful of stylised kits. The visual
win has to come from SHADING AND PROPORTIONS, not from another download:
clearcoat car paint + an environment map + real sedan proportions + dark
reflective glass. That is brief docs/briefs/P6-CAR-LOOK.md.
