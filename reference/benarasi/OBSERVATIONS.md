# Mirpur Benarasi Palli — observations, 20 September 2026

Per `reference/README.md` the durable output is this written spec; no
third-party imagery is stored in the repo.

## What it is

The Benarasi saree market in Mirpur Section 10, Block A — a grid of lanes
(Lane 1–5, Ave No. 1–2) lined with saree shops. Founded by weavers who
migrated from Varanasi in the 1960s. Shop addresses on Google Maps read like
"House-3, Section-10, Block-A, Lane-2, Mirpur Benaroshi Polli, মিরপুর ১০ নং
গোলচত্বর", so the market sits just off Mirpur 10 circle.

## Sources

- **OpenStreetMap** (ODbL), from `data/north.osm.json`:
  - Seven ways named **"Benaroshi Polli Road"** (`24403101`, `33778492`,
    `374514970`, `374515879`, `700088488`, `957015629`, `957015632`),
    ~1.2 km of lane in total, plus way `373801687` "Benaroshi Polli".
  - **18 named saree shops**, all `shop=clothes`, listed below.
- **Wikimedia Commons**, viewed 2026-09-20:
  - *A gate of Mirpur Benarashi Palli, Dhaka,2014.jpg* — **the gate**.
  - *Benarasi Palli's shop of Mirpur Dhaka,2014.jpg*, *Mirpur Benarasi Palli.jpg*.
- **Google Street View**, official coverage (Sept 2023 and March 2015 panos
  exist in Section 10, unlike Mirpur 10 circle which has none).

## The gate (observed, 2014 photo)

- A wide **horizontal signboard beam spanning the full width of the road**,
  carried on columns — not an arch.
- The beam is **dark red / maroon** with **large white Bangla lettering**:
  **মিরপুর বেনারশী পল্লী**, and a smaller white sub-line beneath it.
- Columns are square and painted in **red and white bands**.
- To one side, a **vertical stacked-Bangla sign** reading বেনারসী.

## The shopfront colonnade (observed, same photo)

- A continuous **colonnade over the footpath**: square columns in the same
  **red-and-white banding**, carrying a flat canopy.
- Above the canopy, a continuous **red fascia band with white Bangla shop
  names** — e.g. রূপ সিঙ্গার / "ROOP SHINGAR", বেনারসী, BIG BAZAR.
- Plain rendered buildings of 4–6 storeys behind.
- Street level: rickshaws parked under the colonnade, dust, overhead cables.

**Red and white is the signature of this market** the way red-oxide steel is
the signature of the Mirpur 10 footbridge.

## The 18 surveyed shops (scene metres)

Maisha Benaroshi House (349.8, 339.6) · Benaroshi Kuthi-বেনারসি কুঠি
(284.9, 423) · Bristy Benaroshi Silk House (425.4, 102.3) · Sadia Benaroshi
House (298.2, 190.2) · Benaroshi Achan (285.9, 295) · Benaroshi Kuthi
(231.6, 315.9) · Apan Benaroshi (327.5, 369) · Benaroshi Choice (311.1,
234.1) · Golden Benaroshi House (273.5, 236.9) · Mirpur Benaroshi House
(244.7, 280.2) · Pabna Benaroshi Museum (256.2, 316.2) · Lal Benaroshi
(334.9, 319.6) · Benaroshi Choice (311.2, 238.3) · Al-Hamd Benaroshi (230.2,
265.8) · Benaroshi World (243.3, 246.6) · Monica Benaroshi Sharee (357.5,
406.5) · Resa Benaroshi (356.1, 397.7) · Benaroshi King (281.1, 408.2)

## Known gaps / unverified

- **Gate position is INFERRED, not photographed in place.** It is placed at
  (362.6, 719.2), where OSM's "Benaroshi Polli Road" meets Mirpur Road-13 —
  the entrance to the lane that carries the market's name, 180 m from Mirpur
  10 circle. The 2014 photo does not carry a geotag, and a Street View look
  at that junction (Sept 2023) did not show a gate in frame. The market has
  more than one gate; shop addresses mention "1 No. Gate".
- Gate dimensions are **estimated from the photograph**, not measured.
- The sub-line under the main gate lettering is not legible at the
  resolution viewed, so only the main name is reproduced.
- Only the 18 OSM-mapped shops get the colonnade treatment. The real market
  has many more; Google Maps alone lists shops not in OSM.

## Build notes (what actually got placed)

- The gate is set **17 m up the lane** from the OSM junction node, because
  that node sits ON Mirpur Road-13 — a gate built at the node itself would
  have had its columns standing in the main carriageway. Its span is taken
  from the lane's own mapped width rather than a fixed number.
- **The colonnade attaches flush to each shop's road-facing wall**, not as a
  freestanding structure on the footpath. city.js already clips these
  footprints at the carriageway edge, and in this market the blocks are built
  right out to the kerb — a freestanding colonnade was buried inside the
  building at all 14 candidate shops when first tried.
- Of the 18 surveyed shops, **8 get a colonnade bay**; 6 are skipped for
  having no wall segment that both faces the lane and is at least ~3.8 m
  long, and the rest fail the carriageway clearance test. Skipping is
  deliberate: better a missing shopfront than one standing in the road.
- Every placed bay is checked against the **whole road network**, not just
  the lane it fronts, at the corners of its footprint. The build logs the
  worst clearance; it must stay positive.
