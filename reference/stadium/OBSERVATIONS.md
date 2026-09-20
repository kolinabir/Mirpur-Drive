# Sher-e-Bangla National Cricket Stadium — observations, 20 September 2026

Per `reference/README.md` the durable output is this written spec; no
third-party imagery is stored in the repo.

## Sources

- **Plan: OpenStreetMap** (ODbL), from `data/north.osm.json`:
  - way `121390579` — `leisure=stadium`, `name:en=Sher-E-Bangla National
    Cricket Stadium`, `wikidata=Q16135053`, 49-node ring.
  - way `121390580` — the playing area inside it, 45-node ring.
- **Wikimedia Commons**, category `Sher-e-Bangla National Cricket Stadium`
  (163 files), viewed 2026-09-20 in the browser:
  - Aerial: *Sher-e-Bangla National Cricket Stadium, Dhaka.jpg*, Iqbal Mahmud
    Nayan, **CC BY 4.0** — whole bowl from the air, with the surrounding city.
  - Interior: *BPL 2023 - Sylhet Strikers vs Rangpur Riders 01.jpg* — from
    inside the bowl at dusk, stands and floodlights.

## Plan (surveyed)

Outer ring centre at scene **(-329.8, 761.1)**; radius varies **88.9 – 130.8 m**
(mean 114.6) — a squashed oval, not a circle. The playing area inside runs
70.1 – 105.1 m (mean 86.0) about a centre 17 m north of the outer centre, so
the bowl is **not concentric**: the stand is much deeper on the south side.

OSM building `6385797` (area 40,941 m², h 19.4) is this same ring, and the
generic extruder was rendering it as one flat-topped block 19.4 m tall. It is
now excluded from that extruder.

## Elevation (observed)

- **Seats are GREEN** — a continuous ring of green seating, clearly the
  dominant colour of the bowl from inside.
- **Low single-tier bowl.** City buildings are visible over the roofline all
  the way round, so the stands are low — roughly 12–18 m, not a deep bowl.
- **Roof canopy** over the back of the stand for most of the ring: a shallow
  flat/slightly pitched canopy on columns, pale grey/white, with a
  **distinct RED fascia band along its leading edge**. The red band is the
  most recognisable colour note after the green seats.
- **A taller pavilion / media block** on one side, with banded windows —
  reads lighter and boxier than the rest of the ring.
- **Floodlights:** slim masts carrying a wide rectangular lamp head, standing
  well above the roofline.
- **Field:** green outfield with the lighter tan central pitch square.
  Advertising boundary boards ring the playing area.

## Known gaps / unverified

- **Number of floodlight masts is NOT verified.** Two are clearly visible in
  the interior shot and the aerial; the model places six evenly, which is a
  reasonable cricket-ground arrangement but is an assumption.
- Exact stand height, seat rows, roof depth and the pavilion's position on
  the ring are **estimated from photographs**, not measured.
- The big video scoreboard seen in the interior shot is not modelled yet.
- The bowl is modelled closed: there is no gate or concourse to walk in
  through.
