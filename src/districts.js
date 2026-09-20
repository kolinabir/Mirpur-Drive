/**
 * districts.js
 *
 * The map is no longer one place. It is a small set of DISTRICTS, each with
 * its own scene file, its own stretch of MRT Line 6, and its own spawn — and
 * a "through service" gate on the platform at the edge of each one that
 * carries the player to the next district.
 *
 * Why districts rather than one big scene
 * ---------------------------------------
 * Everything is projected into ONE metric frame (origin lat 23.8137, lon
 * 90.3668, +X east, +Z south), so a Bijoy Sarani building and a Mirpur 10
 * building have coordinates in the same system and are directly comparable.
 * But they are 5.3 km apart, and the ~5.5 km of central Dhaka between them
 * (Kazipara, Shewrapara, Agargaon) is dense, fully mapped, and would roughly
 * double an already 30k-building scene for a stretch nobody would drive
 * through. So each district is culled and shipped on its own, and the metro
 * ride between them is a scene swap.
 *
 * Why the swap is a page reload
 * -----------------------------
 * main.js builds the world once and hands the SAME parsed `scene` object to
 * city.js, streets.js, signs.js, metro.js, traffic.js, minimap.js and the
 * collision grid, each of which closes over it and over derived state
 * (tile buckets, instanced meshes, the road graph). city.js can dispose a
 * TILE, but nothing here can tear down a world. Rather than thread teardown
 * through eight modules, `travelTo()` reloads the page with the destination
 * in the query string — the loading screen the game already has becomes the
 * journey. This is a deliberate, documented trade: see docs/BIJOY-DISTRICT.md
 * ("Why not an in-place swap").
 *
 * Station names here MUST match the `name` values in the scene files, which
 * come from OSM `name:en` via tools/build-scene.mjs (including its
 * STATION_RENAME correction for OSM's "Bijoy Sarawni" typo).
 */

/** Query param holding the district to boot into. */
const DISTRICT_PARAM = 'district';
/** Query param naming the station to arrive at, platform level, on boot. */
const ARRIVE_PARAM = 'arrive';

export const DISTRICTS = {
  /**
   * The original map, and still the default: Mirpur 10 -> Mirpur 11 ->
   * Pallabi -> Uttara South, plus the west (Mirpur 2/1) and east (Mirpur
   * 13/14) arms.
   */
  north: {
    key: 'north',
    scene: 'scene-north.json',
    label: 'Mirpur',
    loadingLabel: 'Mirpur corridor (4 stations)',
    // Mirpur 12 / Pallabi, from the owner's own Street View shot — see the
    // SPAWN comment in main.js, which this replaces verbatim.
    spawn: { x: -262, z: -1466, yaw: 0.25 },
    spawnFallbackStation: 'Mirpur 10',
    // Quick-travel digit keys, in order. Digit 1..N.
    // P13-D: Pallabi is this district's primary station (owner, 2026-09-08:
    // "make pallabi default! plz") — slot 0 used to be Mirpur 10. Swapped
    // with the old slot 4 rather than reshuffling the whole array, so Digit2
    // (slot 1, Mirpur 11) and Digit6 (slot 5, Uttara South) still land where
    // they always did; only Digit1 and Digit5 changed, and neither Mirpur 10
    // nor Mirpur 11 was deleted, just moved.
    quickTravel: ['Pallabi', 'Mirpur 11', null, null, 'Mirpur 10', 'Uttara South'],
    gateway: {
      station: 'Mirpur 10', // the southern edge of this district's modelled line
      to: 'bijoy',
      arrive: 'Agargaon',
      towards: 'Motijheel', // the real destination board on that platform
      via: ['Kazipara', 'Shewrapara'],
      viaBn: ['কাজীপাড়া', 'শেওড়াপাড়া'],
      minutes: 7,
    },
  },

  /**
   * The Bijoy Sarani district: Agargaon -> Bijoy Sarani -> Farmgate, built
   * for one reason — Louis Kahn's Jatiya Sangsad Bhaban (the National
   * Parliament House) stands 650 m west of Bijoy Sarani station, and it is
   * the single most worth-visiting building on this line.
   */
  bijoy: {
    key: 'bijoy',
    scene: 'scene-bijoy.json',
    label: 'Bijoy Sarani',
    loadingLabel: 'Bijoy Sarani & Parliament',
    // No hand-picked street spawn here: arriving is always by metro, so the
    // spawn is the platform at the arrival station (see resolveSpawn()).
    spawn: null,
    spawnFallbackStation: 'Bijoy Sarani',
    quickTravel: ['Bijoy Sarani', 'Agargaon', null, null, 'Farmgate', null],
    // Hand-modelled landmark for this district (src/sangsad.js).
    landmark: 'sangsad',
    // P13-D (owner, 2026-09-08: "add a endpoint in there to parlament
    // directly!"): named, non-metro destinations for this district. Each is
    // `{ key, name, bn, x, z, yaw }`. src/sangsad.js does not export a
    // viewpoint (checked as of this pass — SANGSAD_IDS is its only export),
    // so this coordinate lives here instead, as the brief allows.
    //
    // (1192, 5920) is a hand-picked viewpoint on the Manik Mia Avenue side,
    // south of the building, facing north (yaw 0 = -Z = north, see the
    // frame note above). Checked against the real footprint in
    // public/scene-bijoy.json (OSM relation 18085267, SANGSAD_IDS[0]): its
    // vertices span x 1120.7-1271.4, z 5635.9-5810.0, centre (1196, 5723) —
    // so this viewpoint sits ~110 m south of the building's own south edge,
    // squarely on the avenue, looking straight at the south facade. Eye
    // height (1.68) matches every other on-foot teleport in this file.
    destinations: [
      {
        key: 'sangsad',
        name: 'Jatiya Sangsad Bhaban',
        bn: 'জাতীয় সংসদ ভবন',
        x: 1192,
        z: 5920,
        y: 1.68,
        yaw: 0,
      },
    ],
    gateway: {
      station: 'Agargaon', // the northern edge of this district's modelled line
      to: 'north',
      arrive: 'Mirpur 10',
      towards: 'Uttara North',
      via: ['Shewrapara', 'Kazipara'],
      viaBn: ['শেওড়াপাড়া', 'কাজীপাড়া'],
      minutes: 7,
    },
  },

  /**
   * The original two-station scene. Kept as the fallback if a big map ever
   * regresses (it was already reachable as `?scene=old`, which still works).
   */
  old: {
    key: 'old',
    scene: 'scene.json',
    label: 'Mirpur (small map)',
    loadingLabel: 'Mirpur',
    spawn: null,
    spawnFallbackStation: 'Mirpur 10',
    quickTravel: ['Mirpur 10', 'Mirpur 11'],
  },
};

/**
 * Which district to boot into, and where in it to arrive.
 *
 * Accepts, in priority order:
 *   ?district=bijoy&arrive=Bijoy%20Sarani   (what travelTo() writes)
 *   ?scene=north | ?scene=old               (legacy, still documented in
 *                                            docs/ and in muscle memory)
 *   the default district (north / Pallabi)
 *
 * P13-D (owner, 2026-09-08: "make pallabi default! plz"): this used to fall
 * back to `localStorage.mirpurDistrict` / `mirpurScene` before defaulting to
 * 'north'. travelTo() below wrote the destination district into that key on
 * every ride, so once the player had ridden to Bijoy Sarani even once, EVERY
 * later plain load of the game (a bookmark, a fresh tab, just typing the
 * bare URL) read that leftover key back out and dropped them in Bijoy
 * Sarani again, with no `?district=` in the URL to explain why. That is
 * almost certainly what the owner hit. The explicit query param (or its
 * `?scene=` alias) is still fully authoritative — that is how travelTo()'s
 * own reload actually lands on the right district — but a bare URL with no
 * query string now has nothing left to fall back to except 'north', every
 * time, regardless of any district a previous session left lying around in
 * storage.
 *
 * @returns {{district: object, arriveStation: string|null}}
 */
export const ALL_DISTRICT_STATIONS = [
  { name: 'Uttara South', bn: 'উত্তরা দক্ষিণ', district: 'north', x: -371.5, z: -3585 },
  { name: 'Pallabi', bn: 'পল্লবী', district: 'north', x: -266.2, z: -1386.8 },
  { name: 'Mirpur 11', bn: 'মিরপুর ১১', district: 'north', x: -154.7, z: -600.7 },
  { name: 'Mirpur 10', bn: 'মিরপুর ১০', district: 'north', x: 148.8, z: 593.9 },
  { name: 'Agargaon', bn: 'আগারগাঁও', district: 'bijoy', x: 1349.4, z: 3926.5 },
  { name: 'Bijoy Sarani', bn: 'বিজয় সরণি', district: 'bijoy', x: 1659.7, z: 5266.2 },
  { name: 'Farmgate', bn: 'ফার্মগেট', district: 'bijoy', x: 2068.6, z: 6084.8 },
];

export function findStationNear(x, z, tolerance = 150) {
  let closest = null;
  let minDist = tolerance;
  for (const s of ALL_DISTRICT_STATIONS) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < minDist) {
      minDist = d;
      closest = s;
    }
  }
  return closest;
}

export function districtForCoord(x, z) {
  const st = findStationNear(x, z, 150);
  if (st && st.district) return st.district;
  // Midpoint boundary along MRT Line 6:
  // North corridor ends at z ~ 2000 (Mirpur 10 is z=594)
  // Bijoy Sarani corridor begins at z ~ 3600 (Agargaon is z=3926)
  return z >= 2500 ? 'bijoy' : 'north';
}

/**
 * Which district to boot into, and where in it to arrive.
 *
 * Accepts, in priority order:
 *   ?district=bijoy&arrive=Bijoy%20Sarani   (station platform arrival)
 *   ?district=bijoy&x=1192&z=5920           (coordinate teleport)
 *   ?scene=north | ?scene=old               (legacy aliases)
 *   the default district (north / Pallabi)
 *
 * @returns {{district: object, arriveStation: string|null, teleportX: number|null, teleportZ: number|null, teleportY: number|null}}
 */
export function resolveDistrict(search = location.search) {
  const params = new URLSearchParams(search);
  const wanted =
    params.get(DISTRICT_PARAM) ||
    params.get('scene') || // legacy alias: ?scene=north / ?scene=old
    'north';
  const district = DISTRICTS[wanted] || DISTRICTS.north;
  const arriveStation = params.get(ARRIVE_PARAM);
  const teleportX = params.has('x') ? parseFloat(params.get('x')) : null;
  const teleportZ = params.has('z') ? parseFloat(params.get('z')) : null;
  const teleportY = params.has('y') ? parseFloat(params.get('y')) : null;
  return { district, arriveStation, teleportX, teleportZ, teleportY };
}

/**
 * Leave for another district. Writes the destination into the URL and
 * reloads — see the module comment for why this is a reload and not a
 * live scene swap.
 *
 * @param {string} districtKey key into DISTRICTS
 * @param {string|null} arriveStation station name to arrive at, platform level
 * @param {{x: number, z: number, y?: number}|null} teleportCoords coordinate target
 */
export function travelTo(districtKey, arriveStation = null, teleportCoords = null) {
  const d = DISTRICTS[districtKey];
  if (!d) {
    console.error(`[districts] no such district: ${districtKey}`);
    return;
  }
  const params = new URLSearchParams(location.search);
  params.delete('scene'); // don't let the legacy alias override the new key
  params.set(DISTRICT_PARAM, districtKey);
  if (arriveStation) {
    params.set(ARRIVE_PARAM, arriveStation);
    params.delete('x');
    params.delete('z');
    params.delete('y');
  } else if (teleportCoords && Number.isFinite(teleportCoords.x) && Number.isFinite(teleportCoords.z)) {
    params.delete(ARRIVE_PARAM);
    params.set('x', Math.round(teleportCoords.x));
    params.set('z', Math.round(teleportCoords.z));
    if (Number.isFinite(teleportCoords.y)) {
      params.set('y', teleportCoords.y);
    } else {
      params.delete('y');
    }
  } else {
    params.delete(ARRIVE_PARAM);
    params.delete('x');
    params.delete('z');
    params.delete('y');
  }
  location.search = params.toString();
}

/**
 * The gateway this district offers FROM `stationName`, or null if that
 * station is not a district edge.
 */
export function gatewayAt(district, stationName) {
  const g = district?.gateway;
  return g && g.station === stationName ? g : null;
}

/**
 * P13-E (owner, live, 2026-09-08: "cant jumb to mirpur!"): a first-class,
 * quick-travel-shaped view of this district's gateway, so main.js can offer
 * it a digit key and a "Jump to" line exactly like it does for stations and
 * named destinations, WITHOUT walking to the platform and boarding a train.
 * Deliberately derived from `gateway` on every call rather than stored as a
 * new field on the district — `to`, `arrive`, `via`, `viaBn` and the label
 * all already live there (label via DISTRICTS[gateway.to].label), and
 * duplicating them here would just be a second place for them to drift out
 * of sync. Returns null for a district with no gateway (`old`), which is
 * exactly what should make the key a no-op there.
 */
export function gatewayJump(district) {
  const g = district?.gateway;
  if (!g) return null;
  const destDistrict = DISTRICTS[g.to];
  return {
    label: g.arrive ?? destDistrict?.label ?? g.towards, // e.g. "Bijoy Sarani" / "Mirpur"
    arrive: g.arrive, // platform station name the ride lands on
    gateway: g, // passed straight to openGatewayModal() — same modal the platform gate opens
  };
}

/**
 * Catalog of all fast-travel & teleport destinations for the Teleport HUD (O key).
 * Encompasses all MRT Line 6 stations, iconic hand-modeled landmarks, and panoramic vantages.
 */
export const ALL_TELEPORT_PLACES = [
  // --- METRO STATIONS ---
  {
    id: 'st-pallabi',
    name: 'Pallabi Station',
    bn: 'পল্লবী স্টেশন',
    category: 'station',
    icon: '🚇',
    district: 'north',
    districtLabel: 'Mirpur North',
    isStation: true,
    stationName: 'Pallabi',
    x: -266.2,
    z: -1386.8,
    desc: 'Northern arterial station, adjacent to Mirpur 12 bus stand and shopping frontage.',
  },
  {
    id: 'st-mirpur11',
    name: 'Mirpur 11 Station',
    bn: 'মিরপুর ১১ স্টেশন',
    category: 'station',
    icon: '🚇',
    district: 'north',
    districtLabel: 'Mirpur North',
    isStation: true,
    stationName: 'Mirpur 11',
    x: -154.7,
    z: -600.7,
    desc: 'Busy commercial corridor with high footbridge and dense street activity.',
  },
  {
    id: 'st-mirpur10',
    name: 'Mirpur 10 Station',
    bn: 'মিরপুর ১০ স্টেশন',
    category: 'station',
    icon: '🚇',
    district: 'north',
    districtLabel: 'Mirpur North',
    isStation: true,
    stationName: 'Mirpur 10',
    x: 148.8,
    z: 593.9,
    desc: 'Major roundabout hub, busiest intersection and commercial core of Mirpur.',
  },
  {
    id: 'st-uttara-south',
    name: 'Uttara South Station',
    bn: 'উত্তরা দক্ষিণ স্টেশন',
    category: 'station',
    icon: '🚇',
    district: 'north',
    districtLabel: 'Mirpur North',
    isStation: true,
    stationName: 'Uttara South',
    x: -371.5,
    z: -3585.0,
    desc: 'Northern terminal gateway connecting Mirpur towards the Uttara depot.',
  },
  {
    id: 'st-agargaon',
    name: 'Agargaon Station',
    bn: 'আগারগাঁও স্টেশন',
    category: 'station',
    icon: '🚇',
    district: 'bijoy',
    districtLabel: 'Bijoy Sarani',
    isStation: true,
    stationName: 'Agargaon',
    x: 1349.4,
    z: 3926.5,
    desc: 'Administrative corridor hub with wide boulevards and government institutions.',
  },
  {
    id: 'st-bijoy-sarani',
    name: 'Bijoy Sarani Station',
    bn: 'বিজয় সরণি স্টেশন',
    category: 'station',
    icon: '🚇',
    district: 'bijoy',
    districtLabel: 'Bijoy Sarani',
    isStation: true,
    stationName: 'Bijoy Sarani',
    x: 1659.7,
    z: 5266.2,
    desc: 'Key transit intersection and gateway to Louis Kahn\'s National Parliament House.',
  },
  {
    id: 'st-farmgate',
    name: 'Farmgate Station',
    bn: 'ফার্মগেট স্টেশন',
    category: 'station',
    icon: '🚇',
    district: 'bijoy',
    districtLabel: 'Bijoy Sarani',
    isStation: true,
    stationName: 'Farmgate',
    x: 2068.6,
    z: 6084.8,
    desc: 'Southern terminus connecting the metro corridor directly into central Dhaka.',
  },

  // --- LANDMARKS & GOOD PLACES ---
  {
    id: 'lm-sangsad',
    name: 'Jatiya Sangsad Bhaban',
    bn: 'জাতীয় সংসদ ভবন',
    category: 'landmark',
    icon: '🏛️',
    district: 'bijoy',
    districtLabel: 'Bijoy Sarani',
    x: 1192,
    z: 5920,
    y: 1.68,
    yaw: 0,
    desc: 'Louis Kahn\'s architectural masterpiece, the National Parliament House of Bangladesh.',
  },
  {
    id: 'lm-bfc',
    name: 'BFC & KFC Food Tower',
    bn: 'বিএফসি ও কেএফসি টাওয়ার',
    category: 'landmark',
    icon: '🍔',
    district: 'north',
    districtLabel: 'Mirpur North',
    x: -248,
    z: -1475,
    y: 1.68,
    yaw: 1.57,
    desc: '7-storey dining landmark on Begum Rokeya Ave with illuminated fast-food facades.',
  },
  {
    id: 'lm-southpoint',
    name: 'South Point School & College',
    bn: 'সাউথ পয়েন্ট স্কুল এন্ড কলেজ',
    category: 'landmark',
    icon: '🏫',
    district: 'north',
    districtLabel: 'Mirpur North',
    x: -258,
    z: -1612,
    y: 1.68,
    yaw: 1.57,
    desc: 'Realistic academic campus facade fronting Mirpur Ceramic Road.',
  },
  {
    id: 'lm-regal',
    name: 'Regal & Best Buy Plaza',
    bn: 'রিগ্যাল ও বেস্ট বাই প্লাজা',
    category: 'landmark',
    icon: '🏬',
    district: 'north',
    districtLabel: 'Mirpur North',
    x: -258,
    z: -1588,
    y: 1.68,
    yaw: 1.57,
    desc: 'Prominent commercial retail storefront on Mirpur Ceramic Road.',
  },
  {
    id: 'lm-mirpur10-circle',
    name: 'Mirpur 10 Golchokkor',
    bn: 'মিরপুর ১০ গোলচত্বর',
    category: 'landmark',
    icon: '⭕',
    district: 'north',
    districtLabel: 'Mirpur North',
    x: 152,
    z: 625,
    y: 1.68,
    yaw: 0,
    desc: 'Vibrant circular roundabout hub connecting all four corners of Mirpur.',
  },
  {
    id: 'lm-manik-mia',
    name: 'Manik Mia Avenue',
    bn: 'মানিক মিয়া এভিনিউ',
    category: 'landmark',
    icon: '🌳',
    district: 'bijoy',
    districtLabel: 'Bijoy Sarani',
    x: 1450,
    z: 5920,
    y: 1.68,
    yaw: 0,
    desc: 'Grand avenue and wide open boulevard running south of Parliament House.',
  },

  // --- SPECIAL VANTAGE POINTS ---
  {
    id: 'lm-stadium',
    name: 'Sher-e-Bangla Cricket Stadium',
    bn: 'শের-ই-বাংলা জাতীয় ক্রিকেট স্টেডিয়াম',
    category: 'landmark',
    icon: '🏏',
    district: 'north',
    districtLabel: 'Mirpur North',
    // On the outfield, south of the pitch, looking north at the main stand.
    x: -329.8,
    z: 800,
    y: 1.93,
    yaw: 0,
    desc: 'The home of Bangladesh cricket. Lands you on the outfield, facing the stand.',
  },
  {
    id: 'lm-mirpur10-fob',
    name: 'Mirpur 10 Foot Over Bridge',
    bn: 'মিরপুর - ১০ ফুট ওভার ব্রিজ',
    category: 'landmark',
    icon: '🌉',
    district: 'north',
    districtLabel: 'Mirpur North',
    // Mid-span of the east arm, 5.5 m up, looking back along the deck to the hub.
    x: 195,
    z: 741.5,
    y: 7.18,
    yaw: 1.03,
    desc: 'The four-armed footbridge over Mirpur 10 circle, under the MRT-6 viaduct.',
  },
  {
    id: 'lm-benarasi',
    name: 'Benarasi Palli Gate',
    bn: 'মিরপুর বেনারশী পল্লী',
    category: 'landmark',
    icon: '🧵',
    district: 'north',
    districtLabel: 'Mirpur North',
    // On Mirpur Road-13, just outside the gate, looking straight at it.
    x: 372,
    z: 741,
    y: 1.68,
    yaw: 0.41,
    desc: 'The Benarasi saree market gate, Section 10 Block A. Weavers came here from Varanasi in the 1960s.',
  },
  {
    id: 'vp-platform',
    name: 'Metro Platform Deck',
    bn: 'মেট্রো প্ল্যাটফর্ম ডেক',
    category: 'vantage',
    icon: '🚉',
    district: 'current',
    districtLabel: 'Active Station',
    isPlatform: true,
    desc: 'Elevated platform view right beside the tracks to observe arriving MRT Line 6 trains.',
  },
  {
    id: 'vp-aerial',
    name: 'Aerial City Vista',
    bn: 'আকাশ থেকে শহরের দৃশ্য',
    category: 'vantage',
    icon: '🦅',
    district: 'current',
    districtLabel: 'Sky Vista',
    isAerial: true,
    desc: 'Panoramic aerial sky vista overlooking the metro corridor and city skyline.',
  },
];

