import { createTransitHud } from './transit-hud.js';
/**
 * main.js
 *
 * Boots the renderer, builds the corridor, and runs the frame loop.
 */

import * as THREE from 'three';
import { loadFacadeTextures } from './facade-loader.js';
import { createPerfGovernor } from './perf-governor.js';
import { buildBuildings, buildCollisionGrid, updateBuildingLOD, ingestSceneColliders, resolveCollision } from './city.js';
import { buildNeighbourhoodDetails } from './neighbourhood-details.js';
import { buildWorldDetails } from './world-details.js';
import { buildLandmarks, buildStreetFrontage } from './landmarks.js';
import { setVolume, ensureAudioContext } from './audio.js';
import { createWorldAudio } from './worldaudio.js';
import { createDestructibles } from './destructibles.js';
import { buildStreets } from './streets.js';
import { buildMetro, METRO, registerViaductWalkable } from './metro.js';
import { buildTraffic, buildPedestrians } from './traffic.js';
import { buildShopSigns, makeStationLabel } from './signs.js';
import { Sky, TIMES_OF_DAY } from './sky.js';
import { createNight } from './night.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Player, normalizeKeyCode } from './player.js';
import { Minimap } from './minimap.js';
import { createWalkableRegistry } from './walkable.js';
import { createInteriorSystem } from './interior.js';
import { createStationLife } from './stationlife.js';
import { createGameMenu } from './game-menu.js';
import { tr, num, localName, distanceFrom, applyI18n, getLang } from './i18n.js';
import { DISTRICTS, resolveDistrict, travelTo, gatewayAt, gatewayJump, districtForCoord, findStationNear, ALL_DISTRICT_STATIONS, ALL_TELEPORT_PLACES } from './districts.js';
import { buildSangsad, SANGSAD_IDS } from './sangsad.js';
import { createSwitchCamera } from './switch-camera.js';
import { createIntroCinematic } from './intro-cinematic.js';
import { createFirstJourney } from './first-journey.js';
import { createMobileControls, isGameplayBlocked } from './mobile-controls.js';
import { createStreetLife } from './streetlife/index.js';
import { buildMirpur10Bridge } from './mirpur10-bridge.js';
import { buildStadium, STADIUM_BUILDING_IDS } from './stadium.js';
import { buildBenarasiPalli } from './benarasi-palli.js';

const loadingEl = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const loadingBar = document.getElementById('loading-bar');
const loadingPct = document.getElementById('loading-pct');
const loadingTipText = document.getElementById('loading-tip-text');
const loadingMainTitle = document.getElementById('loading-main-title');
const loadingSubText = document.getElementById('loading-sub-text');
const startPanel = document.getElementById('start');
const hud = document.getElementById('hud');
const statsEl = document.getElementById('stats');
const locationEl = document.getElementById('location');
const timeLabel = document.getElementById('time-label');
const buildInfo = document.getElementById('build-info');
const boundaryEl = document.getElementById('boundary-warning');

const LOADING_TIPS = [
  'Press <b>O</b> at any time to open the instant Teleport Menu and jump anywhere!',
  'Press <b>V</b> to enter or exit drivable cars and cruise down Begum Rokeya Avenue.',
  'Press <b>M</b> or click the minimap to open the full interactive Dhaka map.',
  'Press <b>T</b> to cycle between morning, midday, golden sunset, and neon night.',
  'Press <b>E</b> to interact with ticket turnstiles and board MRT Line 6 trains.',
  'Press <b>H</b> at any time to open the full Controls &amp; Shortcuts guide.',
  'Visit Louis Kahn\'s architectural masterpiece, the National Parliament House (Jatiya Sangsad Bhaban).',
];
let tipIndex = 0;
const tipTimer = setInterval(() => {
  if (loadingTipText && loadingEl && !loadingEl.classList.contains('hidden')) {
    tipIndex = (tipIndex + 1) % LOADING_TIPS.length;
    loadingTipText.innerHTML = LOADING_TIPS[tipIndex];
  } else {
    clearInterval(tipTimer);
  }
}, 2400);

/**
 * Update the loading bar, percentage display, and yield to the browser so it can paint.
 */
let lastStage = null;
function progress(pct, message) {
  // Per-stage load timing, so load-speed work is measured rather than guessed.
  const now = performance.now();
  if (lastStage) console.info(`[load] ${Math.round(now - lastStage.t)} ms  ${lastStage.message}`);
  if (pct >= 100) console.info(`[load] total ${Math.round(now)} ms since navigation`);
  lastStage = { t: now, message };
  loadingBar.style.width = `${pct}%`;
  document.getElementById('loading-track')?.setAttribute('aria-valuenow', String(Math.round(pct)));
  if (loadingPct) loadingPct.textContent = `${Math.round(pct)}%`;
  loadingText.textContent = message;
  return new Promise((r) => setTimeout(r, 0));
}


/**
 * Playable-boundary helper (docs/briefs/P1-PERF-BOUNDARY.md row P1-A).
 *
 * Flattens all modelled roads in `scene.roads`, the metro tracks, public
 * areas (parks, playgrounds, water bodies, cemeteries) and district
 * destinations into one segment array. This ensures every street, building
 * frontage, landmark, and public space in the district is fully playable
 * without triggering artificial "leaving Mirpur" walls mid-city.
 *
 * `distanceToCorridor(x, z)` uses a 2D spatial hash grid (CELL = 100m) to
 * find the nearest point on any segment in ~0.002ms, returning `{ dist, nx, nz }`
 * so callers can steer/push back toward the road network if the player
 * wanders off the map edges into the void.
 */
function buildBoundarySegments(scene, district) {
  const segs = [];
  const addPts = (pts) => {
    if (!pts || pts.length < 2) return;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      segs.push(a[0], a[1], b[0], b[1]);
    }
  };

  // 1. MRT tracks
  for (const t of scene.metro?.tracks || []) addPts(t.pts);

  // 2. All modelled roads in the district
  for (const r of scene.roads || []) addPts(r.pts);

  // 3. Modelled ground / public areas (parks, water bodies, pitches, cemeteries)
  for (const a of scene.areas || []) {
    if (a.p && a.p.length >= 4) {
      for (let i = 0; i < a.p.length - 2; i += 2) {
        segs.push(a.p[i], a.p[i + 1], a.p[i + 2], a.p[i + 3]);
      }
      segs.push(a.p[a.p.length - 2], a.p[a.p.length - 1], a.p[0], a.p[1]);
    }
  }

  // 4. District named destinations (e.g. Sangsad Bhaban in Bijoy)
  for (const d of district?.destinations || []) {
    if (typeof d.x === 'number' && typeof d.z === 'number') {
      segs.push(d.x - 20, d.z, d.x + 20, d.z);
      segs.push(d.x, d.z - 20, d.x, d.z + 20);
    }
  }

  return segs;
}

function makeBoundary(scene, district) {
  const segs = buildBoundarySegments(scene, district);
  const segCount = segs.length / 4;

  // 2D spatial hash grid for O(1) query performance across all segments
  const CELL = 100;
  const grid = new Map();

  for (let i = 0; i < segCount; i++) {
    const o = i * 4;
    const x1 = segs[o];
    const z1 = segs[o + 1];
    const x2 = segs[o + 2];
    const z2 = segs[o + 3];
    const gx0 = Math.floor(Math.min(x1, x2) / CELL);
    const gx1 = Math.floor(Math.max(x1, x2) / CELL);
    const gz0 = Math.floor(Math.min(z1, z2) / CELL);
    const gz1 = Math.floor(Math.max(z1, z2) / CELL);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const k = `${gx},${gz}`;
        let arr = grid.get(k);
        if (!arr) grid.set(k, (arr = []));
        arr.push(i);
      }
    }
  }

  function distanceToCorridor(x, z) {
    let best = Infinity;
    let bnx = x;
    let bnz = z;
    const gx = Math.floor(x / CELL);
    const gz = Math.floor(z / CELL);

    // Search cells in expanding radial rings
    for (let r = 0; r <= 10; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const arr = grid.get(`${gx + dx},${gz + dz}`);
          if (!arr) continue;
          for (const i of arr) {
            const o = i * 4;
            const x1 = segs[o];
            const z1 = segs[o + 1];
            const x2 = segs[o + 2];
            const z2 = segs[o + 3];
            const segDx = x2 - x1;
            const segDz = z2 - z1;
            const len2 = segDx * segDx + segDz * segDz || 1e-6;
            let t = Math.max(0, Math.min(1, ((x - x1) * segDx + (z - z1) * segDz) / len2));
            const px = x1 + segDx * t;
            const pz = z1 + segDz * t;
            const d = Math.hypot(x - px, z - pz);
            if (d < best) {
              best = d;
              bnx = px;
              bnz = pz;
            }
          }
        }
      }
      if (best <= r * CELL) break;
    }

    // Fallback if coordinates are far outside all active grid cells
    if (best === Infinity && segCount > 0) {
      const x1 = segs[0];
      const z1 = segs[1];
      best = Math.hypot(x - x1, z - z1);
      bnx = x1;
      bnz = z1;
    }

    return { dist: best, nx: bnx, nz: bnz };
  }

  return {
    distanceToCorridor,
    WARN: 400, // m from nearest road/area: HUD "Turn back" line appears
    PUSH: 440, // m: gentle push-back starts, fading in
    HARD: 480, // m: hard clamp
  };
}

async function main() {
  // -------------------------------------------------------------------------
  // Debug flag + district selection (docs/briefs/P1-PERF-BOUNDARY.md row
  // P1-D, docs/briefs/P1-MAIN-WIRING.md item 2, docs/briefs/
  // P12-A-DISTRICT-WIRING.md). Both read once at startup; both accept a URL
  // param or a localStorage fallback so executors doing automated browser
  // review can keep using `?debug`/`?scene=north` or set the localStorage
  // key once and reload.
  // -------------------------------------------------------------------------
  const params = new URLSearchParams(location.search);
  const debugMode = params.has('debug') || localStorage.getItem('mirpurDebug') === '1';
  // District selection (src/districts.js): the map is no longer one place.
  // `north` (Mirpur 10 -> Mirpur 11 -> Pallabi -> Uttara South, plus the
  // west and east arms) is still the DEFAULT map: the owner asked on
  // 2026-09-07 why Uttara South was missing, and P1-MAIN had already
  // verified ?scene=north loads. `resolveDistrict()` keeps that working —
  // `?scene=north` / `?scene=old` are handled inside it as legacy aliases,
  // so this file does not duplicate that fallback chain.
  const { district, arriveStation, teleportX, teleportZ, teleportY } = resolveDistrict();

  if (loadingMainTitle) {
    if (district.key === 'bijoy') {
      loadingMainTitle.innerHTML = 'Bijoy Sarani &amp; Parliament <span class="bn">বিজয় সরণি ও সংসদ ভবন</span>';
      if (loadingSubText) loadingSubText.textContent = 'MRT Line 6 corridor featuring Louis Kahn\'s Jatiya Sangsad Bhaban';
    } else if (district.key === 'north') {
      loadingMainTitle.innerHTML = 'Mirpur Drive <span class="bn">মিরপুর ড্রাইভ</span>';
      if (loadingSubText) loadingSubText.textContent = 'Dhaka MRT Line 6 Corridor — Pallabi, Mirpur 11, Mirpur 10, Uttara South';
    }
  }


  // The fly / platform / aerial lines used to be hidden outside ?debug
  // (P1-PERF-BOUNDARY row P1-D). The owner asked for fly back in the normal
  // build on 2026-09-07, so they are always shown now. The `.debug-only`
  // class is kept in index.html as the marker if this is ever re-gated.

  // -------------------------------------------------------------------------
  // Renderer
  // -------------------------------------------------------------------------
  const canvas = document.getElementById('view');
  // The frame is fill-rate bound (see src/perf-governor.js for the numbers),
  // so pixels are budgeted deliberately:
  //  - 4x MSAA only on low-DPI screens, where edges actually stair-step. On a
  //    2x display the pixels are already finer than the eye resolves at arm's
  //    length, and MSAA there is pure cost on every non-tile-based GPU.
  //  - the pixel ratio starts at 1.5x at most and is then driven per machine
  //    by the governor, between PIXEL_RATIO_MIN and that cap.
  // `?aa=0|1` and `?res=fixed` override both for A/B testing.
  const dpr = window.devicePixelRatio || 1;
  const wantAA = params.has('aa') ? params.get('aa') !== '0' : dpr < 1.5;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: wantAA,
    powerPreference: 'high-performance',
  });
  const PIXEL_RATIO_MAX = Math.min(dpr, 1.5);
  const PIXEL_RATIO_MIN = Math.min(PIXEL_RATIO_MAX, dpr >= 2 ? 0.8 : 0.7);
  renderer.setPixelRatio(PIXEL_RATIO_MAX);
  const perfGovernor = createPerfGovernor(renderer, {
    max: PIXEL_RATIO_MAX,
    min: PIXEL_RATIO_MIN,
    enabled: params.get('res') !== 'fixed',
  });
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene3 = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.1, 2000);

  /**
   * Size the drawing buffer to whatever the window actually is.
   *
   * The page can be laid out after the script runs, which leaves
   * window.innerWidth at 0 on the first pass and permanently pins the canvas
   * to zero. So the size is clamped to a sane minimum and re-applied whenever
   * the document resizes, not only on the window `resize` event, which does
   * not always fire when a preview pane is revealed.
   */
  function resize() {
    const w = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 0);
    const h = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 0);
    if (w < 2 || h < 2) return;
    if (renderer.domElement.width === w && renderer.domElement.height === h) return;
    renderer.setSize(w, h, true);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(document.documentElement);

  // -------------------------------------------------------------------------
  // Data
  // -------------------------------------------------------------------------
  await progress(6, `Loading ${district.loadingLabel} street data`);
  // Facade textures don't depend on the scene data: start them now so the two
  // downloads overlap instead of queueing. Awaited at the facade stage below.
  const facadesPromise = loadFacadeTextures(renderer);
  facadesPromise.catch(() => {}); // surfaced by the await below, not as an unhandled rejection
  const res = await fetch(district.scene);
  if (!res.ok) throw new Error(`Could not load ${district.scene} (${res.status})`);
  const scene = await res.json();

  await progress(16, 'Loading building facades');
  const { texture: facadeTex, emissiveTexture, normal, roughness, roof: roofTex } = await facadesPromise;

  // Spawn point for the initial streamed radius (docs/STREAMING.md), read
  // straight off the raw scene JSON since buildMetro() hasn't run yet at
  // this point in the build sequence. Priority mirrors the real spawn logic
  // further down (item 4 of P12-A): arriving by metro beats the district's
  // own hand-picked spawn beats its fallback station.
  const findRawStation = (name) => scene.metro.stations.find((s) => s.name === name);
  const arriveRawStation = arriveStation ? findRawStation(arriveStation) : null;
  const fallbackRawStation = findRawStation(district.spawnFallbackStation) || scene.metro.stations[0];
  const spawnRaw = arriveRawStation
    ? { x: arriveRawStation.x, z: arriveRawStation.z }
    : district.spawn
    ? { x: district.spawn.x, z: district.spawn.z }
    : { x: fallbackRawStation.x, z: fallbackRawStation.z };

  await progress(30, 'Finding your neighborhood');
  // Sangsad Bhaban (district.landmark === 'sangsad') is hand-modelled by
  // src/sangsad.js instead of the procedural extruder — see that file's
  // header for why a generic facade-atlas box would be worse than nothing
  // for the most architecturally significant building in the country.
  // excludeIds tells buildBuildings() to leave its footprint alone.
  const { group: buildingsGroup, stats: bStats, wallMaterial } = buildBuildings(scene, facadeTex, roofTex, emissiveTexture, {
    start: spawnRaw,
    initialRadius: 500,
    facadeSurfaces: { normal, roughness },
    // The stadium's own OSM ring (6385797) was being extruded as one flat
    // 19.4 m block; src/stadium.js models it properly instead.
    excludeIds: district.landmark === 'sangsad'
      ? SANGSAD_IDS
      : district.key === 'north' ? STADIUM_BUILDING_IDS : undefined,
  });
  scene3.add(buildingsGroup);
  const neighbourhoodDetails = buildNeighbourhoodDetails(scene);
  scene3.add(neighbourhoodDetails.group);
  neighbourhoodDetails.update(spawnRaw.x, spawnRaw.z);
  const worldDetails = buildWorldDetails(scene, district.key);
  scene3.add(worldDetails.group);
  worldDetails.update(spawnRaw.x, spawnRaw.z);

  // Two real, hand-modelled buildings on the Mirpur 12 / Pallabi arterial,
  // built to the owner's own Street View screenshots (owner, 2026-09-07:
  // "make sure to add this exact building same thing same look! same texts
  // in same place!"). See reference/mirpur12/OWNER-STREETVIEW-2026-09-07.md
  // (third batch) and src/landmarks.js. Independent of the tile/atlas
  // system so it needed no city.js change.
  const landmarks = buildLandmarks();
  scene3.add(landmarks.group);

  // The Jatiya Sangsad Bhaban (National Parliament House), hand-modelled
  // from the real OSM ring in this scene — see src/sangsad.js's header for
  // what is measured versus interpreted. buildSangsad() itself returns null
  // harmlessly on any scene without the Parliament footprint, so this only
  // gates the call to skip scanning scene.buildings on districts that could
  // never have one.
  const sangsad = district.landmark === 'sangsad' ? buildSangsad(scene) : null;
  if (sangsad) scene3.add(sangsad.group);

  // The rest of the same street (owner: "make rest on that street same
  // alike!"). public/street-pallabi.json is the 28 real frontage footprints
  // between the Mirpur 12 bus stand and Pallabi station, each carrying the
  // REAL businesses OSM records at that address. Non-fatal if it 404s.
  let frontage = null;
  try {
    const fres = await fetch('street-pallabi.json');
    if (fres.ok) {
      frontage = buildStreetFrontage(await fres.json(), scene, [428135535, 352027195, 352027475]);
      scene3.add(frontage.group);
    }
  } catch (err) {
    console.warn('[frontage] skipped:', err.message);
  }

  const boundary = makeBoundary(scene, district);

  await progress(52, 'Opening the streets');
  const { group: streetsGroup, stats: sStats } = buildStreets(scene);
  scene3.add(streetsGroup);

  await progress(64, 'Bringing the neighborhood to life');
  const signsGroup = buildShopSigns(scene);
  scene3.add(signsGroup);

  await progress(
    74,
    district.key === 'bijoy'
      ? 'Raising the MRT Line 6 viaduct (Agargaon – Bijoy Sarani – Farmgate)'
      : 'Raising the MRT Line 6 viaduct (Mirpur 10 – Uttara South)'
  );
  const metro = buildMetro(scene, makeStationLabel);
  scene3.add(metro.group);

  await progress(
    86,
    district.key === 'bijoy'
      ? 'Putting traffic on Bijoy Sarani & Manik Mia Avenue'
      : 'Putting traffic on Mirpur corridor arterials'
  );
  // Seed the fleet and the crowd at the spawn so the street is busy from the
  // first frame, not a minute later once recycling has gathered them in.
  // Same spawnRaw point used for the initial LOD radius above.
  const trafficOrigin = spawnRaw;
  const traffic = buildTraffic(scene, trafficOrigin);
  const worldAudio = createWorldAudio(traffic, metro);
  scene3.add(traffic.group);
  const peds = buildPedestrians(scene, 750, trafficOrigin);
  scene3.add(peds.group);

  await progress(94, 'A new day in Dhaka');
  const sky = new Sky(scene3, renderer);
  const night = createNight(scene3, sky, {
    wallMaterial: {
      setNightIntensity(v) {
        wallMaterial.setNightIntensity?.(v);
        landmarks.setNightIntensity(v);
        frontage?.setNightIntensity(v);
        sangsad?.setNightIntensity(v);
      },
    },
    traffic,
  });

  // -------------------------------------------------------------------------
  // P11-C (docs/briefs/P11-C-ENV-AND-TEXTURE-SHARING.md), finding 1, CORRECTED
  // per advisor note below.
  //
  // scene3.environment was null, so any MeshStandardMaterial with meaningful
  // metalness (platform-edge screens, AFC gates, lift, masts, handrails) has
  // nothing to reflect and renders near-black under directional + hemisphere
  // + ambient light alone.
  //
  // ORIGINAL APPROACH (reverted): pmremGenerator.fromScene(scene3, ...) to
  // probe the live scene so the reflection tint tracks the current sky
  // preset. This broke startup entirely — fromScene() re-renders the scene
  // into PMREM's internal cube render target using the scene's own
  // materials' shader programs, and this scene has several patched/custom
  // materials (sky.js's sky dome, facades.js's facade atlas, metro.js's
  // placeholder-map materials) that do unusual things with uniforms. One of
  // those programs isn't valid for that internal render pass, and threw
  // inside _sceneToCubeUV with "Cannot read properties of undefined
  // (reading 'value')" — which took down the entire app at startup, not
  // just the reflection.
  //
  // FIX: use RoomEnvironment (three/addons/environments/RoomEnvironment.js),
  // a tiny throwaway scene of plain built-in materials, so PMREM never
  // touches this scene's custom shaders. Generate it ONCE at startup — it's
  // cheap and, being a fixed room, never needs regenerating. Day/night
  // response is kept entirely via scene3.environmentIntensity (still
  // updated on the 'T' key below), not by re-probing anything.
  //
  // The whole thing is wrapped in try/catch: a cosmetic reflection map must
  // never be able to take the whole app down again. On failure we just log
  // and leave scene3.environment unset — metals fall back to flat lighting.
  let pmremGenerator = null;
  let envRenderTarget = null;

  function setEnvironmentIntensity() {
    if (!scene3.environment) return;
    // Fill amount only, not exposure/tone-mapping/light intensity — those
    // are owned by the two executors re-tinting materials this pass.
    // P11-J item 0: the day value was 0.35, which the advisor measured live
    // washes the station canopy from DMTCL dark green to a pale mint sheen
    // — it ended up the brightest thing in frame in an aerial view when it
    // should be one of the darkest. 0.12 (same as the night value) is
    // verified live: the canopy reads as dark green corrugated roof and
    // nothing in the interior goes back to black.
    scene3.environmentIntensity = sky.isDark ? 0.12 : 0.12;
  }

  try {
    pmremGenerator = new THREE.PMREMGenerator(renderer);
    // size defaults are fine for a RoomEnvironment probe — it's a reflection
    // tint for metal trim, not a background, so it doesn't need to be sharp.
    envRenderTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene3.environment = envRenderTarget.texture;
    setEnvironmentIntensity();
  } catch (err) {
    console.warn('[main] environment map setup failed; continuing without one', err);
    scene3.environment = null;
  }

  // Same exclusion as buildBuildings() above, applied here too: the
  // procedural collision grid is built from a SEPARATE call over
  // scene.buildings, so leaving the Parliament's footprint in it would give
  // the hand-modelled building an invisible box collider nobody can see
  // (brief item 2). sangsad.colliders (added below, once collision.
  // addSegments exists) supplies the real wall segments instead.
  const collisionBuildings =
    district.landmark === 'sangsad' ? scene.buildings.filter((b) => !SANGSAD_IDS.includes(b.id)) : scene.buildings;
  const collision = buildCollisionGrid(collisionBuildings, scene.roads);
  // Walkable-surface registry (src/walkable.js): station interiors register
  // slabs/ramps/portals here and wall segments via collision.addSegments,
  // which wraps the grid buildCollisionGrid returned without editing city.js.
  const walkable = createWalkableRegistry();
  collision.addSegments = (segs) => walkable.addSegments(collision, segs);
  // The Parliament's real perimeter (src/sangsad.js), now that addSegments
  // exists to receive it — same route the station interiors use.
  if (sangsad) collision.addSegments(sangsad.colliders);
  // P7-COLLISION item 1 (docs/PLAN-COLLISION-PHYSICS.md gap #1): the viaduct
  // piers, station portal columns and streetlight/pole furniture built by
  // metro.js/streets.js were in NO collision set until now. Must run AFTER
  // both scene3.add(metro.group) and scene3.add(streetsGroup) above (so the
  // scene graph actually has 'metro'/'street-furniture' to walk) and AFTER
  // collision.addSegments is wired just above.
  ingestSceneColliders(scene3, collision, metro, METRO);
  registerViaductWalkable(metro.centre, walkable, collision, metro.stations);

  // Destructible streetlight poles (owner, 2026-09-07: "make sure the
  // street lights are collapsible or destroyable using the vehicle, so it
  // won't destroy the vehicle"). Must run AFTER ingestSceneColliders, which
  // is what actually put the poles' collision segments into `collision` in
  // the first place — this module only ever removes segments that call put
  // there, never adds any of its own.
  // The real Mirpur 10 foot over bridge (src/mirpur10-bridge.js). After
  // ingestSceneColliders so collision.addSegments is wired, and only in the
  // district whose scene actually contains Mirpur 10 circle.
  const mirpur10Bridge = district.key === 'north' ? buildMirpur10Bridge({ walkable, collision }) : null;
  const stadium = district.key === 'north' ? buildStadium({ walkable, collision }) : null;
  const benarasi = district.key === 'north' ? buildBenarasiPalli({ scene, collision }) : null;
  if (benarasi) {
    scene3.add(benarasi.group);
    console.info(`[benarasi] Benarasi Palli: ${benarasi.stats.drawCalls} draws, ${benarasi.stats.triangles} tris, ${benarasi.stats.shops} shopfronts, min kerb clearance ${benarasi.stats.minKerbClearance} m (${benarasi.stats.tightest}), ${benarasi.stats.skipped} skipped (no clear footpath)`);
  }
  if (stadium) {
    scene3.add(stadium.group);
    console.info(`[stadium] Sher-e-Bangla: ${stadium.stats.drawCalls} draws, ${stadium.stats.triangles} tris`);
  }
  if (mirpur10Bridge) {
    scene3.add(mirpur10Bridge.group);
    console.info(`[bridge] Mirpur 10 foot over bridge: ${mirpur10Bridge.stats.drawCalls} draws, ${mirpur10Bridge.stats.triangles} tris, ${mirpur10Bridge.stats.panels} rail bays`);
  }

  const destructibles = createDestructibles(scene3, collision);
  const player = new Player(camera, canvas, collision, walkable, debugMode);
  player.boundary = boundary;
  const switchCamera = createSwitchCamera(player, camera, scene3, sky);

  function switchTeleport(targetX, targetZ, targetY = 1.68, targetYaw = player.yaw, locationName = '', targetPitch = 0, isFlying = false) {
    stationlife.cancelRide?.(player);
    if (player.inLift) { interior.state.liftTween = null; player.inLift = false; }
    const dist = Math.hypot(targetX - player.position.x, targetZ - player.position.z);
    if (dist < 8 && !player.flying && !isFlying) {
      player.flying = isFlying;
      player.teleport(targetX, targetZ, targetY, targetYaw);
      player.pitch = targetPitch;
      interior.update(0, player);
      return;
    }
    switchCamera.startSwitch({
      from: player.position,
      to: new THREE.Vector3(targetX, targetY, targetZ),
      targetYaw,
      targetPitch,
      locationName,
      onComplete: () => {
        player.flying = isFlying;
        if (!isFlying) player.feetY = targetY - 1.68;
        interior.update(0, player);
      },
    });
  }

  const interior = createInteriorSystem(scene3, metro, walkable, collision);
  // The through-service gate (item 6, docs/briefs/P12-A-DISTRICT-WIRING.md):
  // each district's registry entry names exactly one station that is the
  // edge of its own modelled line (district.gateway.station). gatewayAt()
  // is the registry's own lookup for "does this station offer a gateway",
  // used here even though we already know the answer for our own district,
  // so this stays correct if a district ever grows more than one gateway.
  const gateway = district.gateway ? gatewayAt(district, district.gateway.station) : null;
  // P11-J: berth detection, platform-door timing, boarding/riding/alighting
  // a train (docs/briefs/P11-J-STATIONLIFE-BOARDING.md). `interior` is
  // passed as a trailing argument beyond the brief's own factory signature
  // so this module can drive interior.setPsdOpen alongside
  // metro.setPlatformDoors — see the deviation note at the top of
  // src/stationlife.js. Both setters, and metro.trains itself, are
  // feature-detected inside stationlife.js: this call is safe even if the
  // concurrent metro.js/interior.js pass hasn't landed them yet. The trailing
  // options object (P12-A: `{ gateway }`) is additive the same way — an
  // older stationlife.js build that doesn't read a 7th argument just ignores
  // it, so the through-service prompt simply doesn't appear until it lands.
  const stationlife = createStationLife(scene3, metro, walkable, collision, player, interior, {
    gateway: gateway
      ? {
          station: gateway.station,
          label: gateway.arrive,
          onBoard: () => openGatewayModal(gateway),
        }
      : undefined,
  });

  // Station lookups driven by the district's own quickTravel array (item 5,
  // docs/briefs/P12-A-DISTRICT-WIRING.md) rather than literal station names:
  // north's registry entry is ['Mirpur 10', 'Mirpur 11', null, null,
  // 'Pallabi', 'Uttara South'] so Digit1/2/5/6 land exactly where they used
  // to; Bijoy Sarani's is ['Bijoy Sarani', 'Agargaon', null, null,
  // 'Farmgate', null] so the same digit keys work there instead. The two
  // null holes are Digit3 (platform preset) and Digit4 (aerial preset),
  // which always key off the district's FIRST station (primaryStation)
  // rather than a digit slot of their own.
  const quickTravel = district.quickTravel || [];
  const stationForDigit = (i) => (quickTravel[i] ? metro.stations.find((s) => s.name === quickTravel[i]) : null);
  const primaryStation = stationForDigit(0) || metro.stations[0];
  const secondaryStation = stationForDigit(1) || null;

  // P13-D: named, non-metro destinations (src/districts.js `destinations`)
  // get the digit slots right after the station jumps — Digit(quickTravel
  // .length + 1), Digit(+2), etc. Today that is just Digit7 for bijoy's
  // Jatiya Sangsad Bhaban viewpoint, but this stays correct if more get
  // added later.
  const destinations = district.destinations || [];
  const digitForDestination = (dest) => quickTravel.length + destinations.indexOf(dest) + 1;

  // P13-E (owner, live: "cant jumb to mirpur!"): the cross-district ride
  // itself gets the next free digit slot after the station jumps AND the
  // named destinations — Digit7 on the north map (0 destinations there),
  // Digit8 on bijoy (1 destination, Jatiya Sangsad Bhaban, already sits on
  // 7). Computed the same way digitForDestination() is, so it never has to
  // be retuned by hand if either array grows. `crossDistrictJump` is null
  // for a district with no gateway (`old`), which is what makes the key a
  // no-op there.
  const crossDistrictJump = gatewayJump(district);
  const gatewayDigit = quickTravel.length + destinations.length + 1;

  // Start facing "up" the district's own line, from its first station
  // toward its second (this used to be hardcoded Mirpur 10 -> Mirpur 11).
  const startYaw = secondaryStation
    ? Math.atan2(-(secondaryStation.x - primaryStation.x), -(secondaryStation.z - primaryStation.z))
    : 0;

  // Unit vector along the alignment, pointing from the district's first
  // station toward its second, derived from the two station positions so it
  // is correct regardless of which way the OSM way was digitised. Falls back
  // to the station's own tangent heading if there is only one station.
  const along = secondaryStation
    ? (() => {
        const dx = secondaryStation.x - primaryStation.x;
        const dz = secondaryStation.z - primaryStation.z;
        const l = Math.hypot(dx, dz) || 1;
        return { x: dx / l, z: dz / l };
      })()
    : { x: Math.sin(primaryStation.heading), z: Math.cos(primaryStation.heading) };
  // Perpendicular to `along`, pointing toward +x (east-ish) when `along`
  // points north — i.e. along rotated so that north maps to east.
  const across = { x: -along.z, z: along.x };

  const PLATFORM_SETBACK = 95; // metres clear of the station platform along the road
  const ROAD_OFFSET = 5.5; // metres off the metro centreline: squarely in the road carriageway (1.5m to 12.0m)

  function stationApproach(station, sign, facing) {
    // If the district provides a dedicated road spawn for its primary station (e.g. Pallabi / Begum Rokeya Ave),
    // always land right on that authentic street point when approaching the station from the road.
    if (station === primaryStation && district.spawn && sign < 0) {
      return {
        x: district.spawn.x,
        z: district.spawn.z,
        yaw: district.spawn.yaw ?? (facing !== undefined ? facing : startYaw),
      };
    }
    const h = station?.heading !== undefined
      ? station.heading
      : (facing !== undefined ? facing : startYaw);
    const fwdX = Math.sin(h);
    const fwdZ = Math.cos(h);
    const rightX = fwdZ;
    const rightZ = -fwdX;
    const laneSide = sign < 0 ? 1 : -1;
    return {
      x: station.x + fwdX * PLATFORM_SETBACK * sign + rightX * (ROAD_OFFSET * laneSide),
      z: station.z + fwdZ * PLATFORM_SETBACK * sign + rightZ * (ROAD_OFFSET * laneSide),
      yaw: facing !== undefined ? facing : (sign < 0 ? h : h + Math.PI),
    };
  }

  // SPAWN (item 4, docs/briefs/P12-A-DISTRICT-WIRING.md), four cases in
  // priority order:
  let startSpot;
  if (teleportX != null && teleportZ != null && Number.isFinite(teleportX) && Number.isFinite(teleportZ)) {
    // 1. Arrived via inter-district coordinate teleport: drop player at exact coordinates
    startSpot = {
      x: teleportX,
      z: teleportZ,
      yaw: startYaw,
    };
    player.flying = false;
    player.teleport(startSpot.x, startSpot.z, teleportY ?? 1.68, startSpot.yaw);
    interior.update(0, player);
    interior.update(0, player);
    interior.update(0, player);
  } else if (arriveStation) {
    // 2. Arrived by metro from another district or teleported to station platform: stand them on that station's
    // platform, walk mode — this mirrors stationlife.alight() exactly
    // (platform centreline, feetY pinned to the deck) rather than importing
    // a private helper from a file this pass does not own.
    const arriveMetroStation = metro.stations.find((s) => s.name === arriveStation) || primaryStation;
    const side = -1; // arbitrary: either platform edge is a legitimate arrival point
    const cx = side * (METRO.TRACK_CENTRES / 2 + 0.1 + METRO.PLATFORM_W / 2);
    const c = Math.cos(arriveMetroStation.heading);
    const s = Math.sin(arriveMetroStation.heading);
    startSpot = {
      x: arriveMetroStation.x + cx * c,
      z: arriveMetroStation.z - cx * s,
      // Face "along the corridor": startYaw already IS that heading for
      // this district (derived from primaryStation -> secondaryStation
      // above), so it doubles as the arrival-facing direction too.
      yaw: startYaw,
    };
    player.flying = false;
    player.teleport(startSpot.x, startSpot.z, METRO.PLATFORM_Y + 1.68, startSpot.yaw);
    // Register the platform slab in the walkable registry BEFORE the first
    // real frame (brief item 4): interior.js only builds a station's slab
    // once the player is within range, and a single call right after
    // teleport() is not guaranteed to have settled it, so this runs a few
    // times up front rather than risk falling through on frame 1.
    interior.update(0, player);
    interior.update(0, player);
    interior.update(0, player);
  } else if (district.spawn) {
    // 3. SPAWN: Mirpur 12 / Pallabi (owner request 2026-09-07, "suppose the
    // player starts from mirpur 12"). These are the coordinates of the
    // owner's own Google Street View shot on Begum Rokeya Ave between
    // Pallabi station (-266, -1377) and the Mirpur 12 bus stand
    // (-275, -1616), transcribed in
    // reference/mirpur12/OWNER-STREETVIEW-2026-09-07.md. Verified live by
    // the advisor: street wall both sides, viaduct down the middle, 60 fps.
    // Only the `north` district carries a hand-picked spawn like this today.
    startSpot = district.spawn;
    player.teleport(startSpot.x, startSpot.z, 1.68, startSpot.yaw);
  } else {
    // 4. No metro arrival, no hand-picked spawn: approach the district's
    // fallback station from the street, exactly like the old Mirpur-10-only
    // fallback did for ?scene=old.
    const fallbackStation = metro.stations.find((s) => s.name === district.spawnFallbackStation) || primaryStation;
    startSpot = stationApproach(fallbackStation, -1, startYaw);
    player.teleport(startSpot.x, startSpot.z, 1.68, startSpot.yaw);
  }

  camera.position.copy(player.position);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  startSpot = { ...startSpot, y: player.position.y };
  const introCinematic = createIntroCinematic({ player, camera, metro, sky, district, startSpot, world: scene3 });

  const minimap = new Minimap(document.getElementById('minimap'), scene, metro.stations);
  const mapHintEl = document.getElementById('maphint');
  // Owner request 2026-09-07: clicking the minimap opens the whole map.
  // Pointer lock is released on the way in so the cursor is usable over it,
  // and the click never reaches the canvas behind (which would re-lock).
  const setMapExpanded = (want) => {
    const open = minimap.setExpanded(want);
    mapHintEl?.classList.toggle('hidden', !open);
    if (open && document.pointerLockElement) document.exitPointerLock();
    return open;
  };
  minimap.onTeleport = (x, z, name = null) => {
    const targetDistrictKey = districtForCoord(x, z);
    if (targetDistrictKey !== district.key) {
      // Coordinate is in another district: auto-load that district properly!
      const st = (name && ALL_DISTRICT_STATIONS.find((s) => s.name === name)) || findStationNear(x, z, 150);
      const arriveSt = (st && st.district === targetDistrictKey) ? st.name : null;
      travelTo(targetDistrictKey, arriveSt, arriveSt ? null : { x, z });
      return;
    }
    setMapExpanded(false);
    switchTeleport(x, z, 1.68, player.yaw, name || 'WAYPOINT');
  };
  minimap.canvas.addEventListener('click', (e) => {
    e.stopPropagation();
    setMapExpanded();
  });

  // ---------------------------------------------------------------------
  // Debug hook (docs/DEBUG-HOOK.md). Exposed as soon as the world exists so
  // other executors' automated-browser review can pose the camera without
  // pointer lock: set player.yaw / player.pitch (radians), player.position,
  // player.flying, or call capture() for a base64 JPEG of the current frame.
  // ---------------------------------------------------------------------
  window.__mirpur = {
    player,
    scene: scene3,
    renderer,
    camera,
    metro,
    collision,
    walkable,
    traffic, // P7-COLLISION verification: traffic.stats.collisionMs, traffic.agentsFor()
    peds,
    resolveCollision, // P7-COLLISION verification only: resolveCollision(collision, x, z, radius, y?)
    interior,
    stationlife, // P11-J: .state.trains[] (berth/door state per train), .state.riding/.state.hint
    boundary,
    debugMode,
    minimap,
    setMapExpanded,
    district, // P12-A: which DISTRICTS entry booted (src/districts.js)
    arriveStation, // P12-A: the ?arrive= station name, or null if not arriving by metro
    openGatewayModal, // P12-A verification: force the through-service popup open
    introCinematic,
    capture() {
      try {
        renderer.render(scene3, camera);
      } catch (err) {
        console.error('capture(): renderer.render threw', err);
      }
      return renderer.domElement.toDataURL('image/jpeg', 0.7);
    },
  };

  const updateTransitHud = createTransitHud(metro, player, stationlife);

  // On-foot layer: hail a ride, cha stalls, street food, places (src/streetlife/).
  const streetlife = createStreetLife({
    scene, scene3, hud, player, camera, traffic, minimap, collision, walkable, district,
    stations: metro.stations,
    corridor: metro.centre,
    signBays: signsGroup.userData.namedBays,
    teleport: (x, z, name) => minimap.onTeleport?.(x, z, name),
  });
  // "Continue" line on the start screen when this district has a save.
  {
    const save = streetlife.state.data;
    const found = Object.keys(save.places || {}).length;
    if (save.rides || save.cups || save.errandsDone || found) {
      const line = document.createElement('p');
      line.className = 'start-continue';
      line.textContent = `Welcome back · ৳${save.taka} · ${found} place${found === 1 ? '' : 's'} found · ${save.rides} ride${save.rides === 1 ? '' : 's'}`;
      document.querySelector('#start .start-actions')?.prepend(line);
      const beginLabel = document.querySelector('#begin span');
      if (beginLabel) beginLabel.textContent = 'CONTINUE JOURNEY';
    }
  }
  window.__mirpur.streetlife = streetlife; // debug hook: .world.stalls/.eateries/.places, .state.data, .rides
  // E goes to the station systems whenever they are showing a prompt, and to
  // the street otherwise; a ride in progress always owns it.
  let stationPromptShown = false;
  const interactWithWorld = () => {
    if (streetlife.riding || !stationPromptShown) {
      if (streetlife.interact()) return;
    }
    if (!stationlife.interact(player)) interior.interact(player);
  };

  // Small "E: ..." interaction prompt line, appended into the existing HUD.
  const interactionEl = document.createElement('div');
  interactionEl.id = 'interaction';
  interactionEl.style.cssText =
    'position:absolute;left:50%;bottom:14%;transform:translateX(-50%);' +
    'color:#f2f2ee;font:14px system-ui, sans-serif;text-shadow:0 1px 3px rgba(0,0,0,.8);' +
    'background:rgba(20,20,20,.35);padding:4px 10px;border-radius:4px;pointer-events:none;';
  hud.appendChild(interactionEl);
  // Every prompt line is written as "E: verb ..." by its owner; here the "E:"
  // becomes a keycap so the one key that drives the on-foot game is obvious.
  let interactionText = '';
  const setInteraction = (text) => {
    text ||= '';
    if (text === interactionText) return;
    interactionText = text;
    interactionEl.replaceChildren();
    if (!text) return;
    const at = text.indexOf('E: ');
    if (at < 0) {
      interactionEl.textContent = text;
      return;
    }
    const key = document.createElement('kbd');
    key.textContent = 'E';
    const verb = text.slice(at + 3);
    interactionEl.append(text.slice(0, at), key, verb.charAt(0).toUpperCase() + verb.slice(1));
    interactionEl.classList.remove('pop');
    void interactionEl.offsetWidth; // restart the fade-in for a new prompt
    interactionEl.classList.add('pop');
  };

  // PRE-WARM THE SPAWN TILES. updateBuildingLOD builds at most ONE tile per
  // call, so arriving in a fresh area shows bare ground + roads + viaduct
  // and the street wall fades in over ~10 s. Tolerable mid-game; fatal at
  // spawn, where it reads as a broken game (advisor, docs/MIRPUR12-RESEARCH.md).
  // Warm it behind the progress bar instead: the loader already yields with
  // setTimeout, so this does not freeze the page.
  await progress(96, 'Your journey is almost ready');
  {
    const t0 = performance.now();
    let built = 0;
    for (let i = 0; i < 140; i++) {
      updateBuildingLOD(startSpot.x, startSpot.z);
      built++;
      // Yield every 20 tiles so the progress bar keeps painting.
      if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0));
      if (performance.now() - t0 > 4000) break; // hard cap, never stall the load
    }
    console.info(`[spawn] pre-warmed ${built} tile passes around (${startSpot.x}, ${startSpot.z}) in ${Math.round(performance.now() - t0)} ms`);
  }

  stationlife.prewarmRide(renderer, camera);

  await progress(100, 'Ready');

  // -------------------------------------------------------------------------
  // Interface
  // -------------------------------------------------------------------------
  const totalDraw =
    bStats.drawCalls + sStats.drawCalls + traffic.stats.drawCalls + metro.group.children.length;

  buildInfo.innerHTML = [
    `<b>${scene.buildings.length.toLocaleString()}</b> buildings`,
    `<b>${scene.roads.length}</b> road ways`,
    `<b>${metro.stats.piers}</b> viaduct piers`,
    `<b>${traffic.stats.vehicles}</b> vehicles`,
    `<b>${(bStats.triangles / 1e6).toFixed(2)}M</b> triangles`,
  ].join(' &middot; ');

  // Help text (item 7, docs/briefs/P12-A-DISTRICT-WIRING.md): the "Jump to"
  // line used to hardcode "1 Mirpur 10 · 2 Mirpur 11 · 5 Pallabi · 6 Uttara
  // South", which is simply wrong on the Bijoy map. Rebuilt here from the
  // same quickTravel array driving the digit keys themselves, so it can
  // never drift out of sync with what the keys actually do. (P13-D: north's
  // quickTravel was reordered so Pallabi is slot 0 — this line now reads "1
  // Pallabi · 2 Mirpur 11 · 5 Mirpur 10 · 6 Uttara South" on that map, which
  // is the point: the start card should say Pallabi first.)
  const quickTravelEl = document.getElementById('quick-travel');
  if (quickTravelEl) {
    const items = quickTravel.map((name, i) => (name ? `<kbd>${i + 1}</kbd> ${name}` : null)).filter(Boolean);
    // P13-D (owner, 2026-09-08: "add a endpoint in there to parlament
    // directly!"): the district's own named, non-metro destinations
    // (src/districts.js `destinations`) get the next digit slots after the
    // station jumps, keyed by their real name — not "Parliament" — with the
    // Bengali alongside it, same pairing style as the gateway's via-station
    // list (joinVia() below).
    for (const dest of destinations) {
      items.push(`<kbd>${digitForDestination(dest)}</kbd> ${dest.name}${dest.bn ? ` (${dest.bn})` : ''}`);
    }
    // P13-E: the cross-district ride, worded so it's obvious this one LEAVES
    // the current map (a plain station name here would read as just another
    // stop) — "<dest label> — <arrival station> (by metro)", e.g. "Mirpur —
    // Mirpur 10 (by metro)" on the bijoy map. When the arrival station name
    // is identical to the destination's own label (true on the north map:
    // both are "Bijoy Sarani") the arrival half is dropped instead of
    // reading as a stutter.
    if (crossDistrictJump) {
      const { label, arrive } = crossDistrictJump;
      const text = arrive && arrive !== label ? `${label} — ${arrive} (by metro)` : `${label} (by metro)`;
      items.push(`<kbd>${gatewayDigit}</kbd> ${text}`);
    }
    quickTravelEl.innerHTML = `${items.join(' &middot; ')}<span class="debug-only"> &middot; <kbd>3</kbd> platform &middot; <kbd>4</kbd> aerial</span>`;
  }

  // Dynamic Start Card & HUD copy for the active district
  // The route line doubles as a spawn picker: each stop is a button that
  // drops the player at that station and starts free roam.
  /** @type {string | null} station picked on the start screen, for the welcome card */
  let startStationName = null;
  const startRouteEl = document.querySelector('.start-route');
  startRouteEl.replaceChildren();
  startRouteEl.setAttribute('aria-label', 'Start at a station');
  const startLabel = document.createElement('em');
  startLabel.textContent = 'Start at';
  startRouteEl.append(startLabel);
  // North to south, the order the line is ridden; the scene file is not sorted.
  [...metro.stations].sort((a, b) => a.z - b.z).forEach((st, i) => {
    if (i) startRouteEl.append(document.createElement('span'));
    const stop = document.createElement('button');
    stop.type = 'button';
    stop.textContent = st.name;
    stop.title = `Start at ${st.name}${st.bn ? ` (${st.bn})` : ''}`;
    stop.addEventListener('click', () => {
      const spot = stationApproach(st, -1, startYaw);
      player.teleport(spot.x, spot.z, 1.68, spot.yaw);
      startStationName = st.name;
      beginJourney(false);
    });
    startRouteEl.append(stop);
  });
  const startTitleEl = document.querySelector('#start h1');
  const startSubEl = document.querySelector('#start .sub');
  const topbarTitleEl = document.querySelector('#topbar .title');

  if (district.key === 'bijoy') {
    if (startTitleEl) startTitleEl.innerHTML = 'Bijoy Sarani &amp; Parliament <span class="bn">বিজয় সরণি ও সংসদ ভবন</span>';
    if (startSubEl) {
      startSubEl.innerHTML =
        'A walkable and drivable reconstruction of the Bijoy Sarani and Manik Mia Avenue corridor ' +
        'along MRT Line 6 in Dhaka &mdash; featuring Louis Kahn\'s Jatiya Sangsad Bhaban ' +
        '(National Parliament House), Bijoy Sarani, Agargaon, and Farmgate stations. ' +
        'Street layout, building footprints and metro alignment from OpenStreetMap. ' +
        'Facades, signage and traffic are generated.';
    }
    if (topbarTitleEl) {
      topbarTitleEl.innerHTML = '<span class="bn">বিজয় সরণি</span> Bijoy Sarani &amp; Parliament';
    }
  } else if (district.key === 'north') {
    if (startTitleEl) startTitleEl.innerHTML = 'Mirpur Drive <span class="bn">মিরপুর ড্রাইভ</span>';
    if (startSubEl) {
      startSubEl.innerHTML =
        'The streets of Dhaka, at your own pace. Walk through Pallabi, ' +
        'drive beneath the metro, or ride across Mirpur.';
    }
    if (topbarTitleEl) {
      topbarTitleEl.innerHTML = '<span class="bn">মিরপুর</span> Mirpur corridor';
    }
  } else if (district.key === 'old') {
    if (startTitleEl) startTitleEl.innerHTML = 'Mirpur Drive <span class="bn">মিরপুর ড্রাইভ</span>';
    if (startSubEl) {
      startSubEl.innerHTML =
        'A walkable and drivable reconstruction of the Mirpur 10 to Mirpur 11 corridor ' +
        'along MRT Line 6, Dhaka. Street layout, building footprints and the metro alignment ' +
        'come from OpenStreetMap.';
    }
    if (topbarTitleEl) {
      topbarTitleEl.innerHTML = '<span class="bn">মিরপুর</span> Mirpur 10 – Mirpur 11';
    }
  }

  // Dynamic boundary warning text matching the active district
  if (boundaryEl) {
    boundaryEl.textContent = `Turn back: leaving ${district.label || 'Mirpur'}`;
  }

  // Through-service popup (item 6, docs/briefs/P12-A-DISTRICT-WIRING.md):
  // the modal offering the metro ride to the next district. Markup + CSS in
  // index.html, matching #start/#help's existing panel look. Hidden by
  // default; opened by stationlife's gateway.onBoard (wired above) when the
  // player boards a train at this district's own gateway station.
  const gatewayEl = document.getElementById('gateway');
  const gatewayTitleEl = document.getElementById('gateway-title');
  const gatewayBodyEl = document.getElementById('gateway-body');
  const gatewayRideBtn = document.getElementById('gateway-ride');
  const gatewayStayBtn = document.getElementById('gateway-stay');

  /** "Kazipara, Shewrapara and Agargaon", pairing each with its Bengali name when given (gateway.via / gateway.viaBn). */
  function joinVia(via, viaBn) {
    const items = (via || []).map((name, i) => (viaBn?.[i] ? `${name} (${viaBn[i]})` : name));
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  }

  function openGatewayModal(gw) {
    if (!gw || !gatewayEl) return;
    const destDistrict = DISTRICTS[gw.to];
    const destLabel = gw.arrive ?? destDistrict?.label ?? gw.towards;
    const viaText = joinVia(gw.via, gw.viaBn);
    const stationsAre = (gw.via?.length ?? 0) > 1 ? 'those stations are' : 'that station is';
    // Worded so it is clear the skipped stops are unbuilt, not that the
    // train itself is skipping real stations (brief item 6).
    const landmarkNote = gw.arrive === 'Bijoy Sarani' ? ', for the National Parliament House' : '';
    gatewayTitleEl.textContent = `Through train to ${destLabel}`;
    gatewayBodyEl.textContent = viaText
      ? `This train runs through ${viaText} without stopping — ${stationsAre} not built yet. Next stop ${destLabel}${landmarkNote}.`
      : `Next stop ${destLabel}${landmarkNote}.`;
    gatewayRideBtn.textContent = `Ride to ${destLabel}`;
    gatewayEl.classList.remove('hidden');
    // Released from pointer lock so the mouse is usable over the buttons —
    // same pattern as setMapExpanded() above.
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function closeGatewayModal() {
    gatewayEl?.classList.add('hidden');
  }

  gatewayRideBtn?.addEventListener('click', () => {
    if (gateway) travelTo(gateway.to, gateway.arrive);
  });
  gatewayStayBtn?.addEventListener('click', closeGatewayModal);

  // -------------------------------------------------------------------------
  // Help Modal (H) and Instant Teleport Modal (O)
  // -------------------------------------------------------------------------
  const helpModal = document.getElementById('help-modal');
  const helpCloseBtn = document.getElementById('help-close');
  const helpOpenTeleport = document.getElementById('help-open-teleport');
  const teleportModal = document.getElementById('teleport-modal');
  const teleportCloseBtn = document.getElementById('teleport-close');
  const teleportBtn = document.getElementById('teleport-btn');
  const teleportSearch = document.getElementById('teleport-search');
  const teleportSearchClear = document.getElementById('teleport-search-clear');
  const teleportGrid = document.getElementById('teleport-grid');
  const bottombarTeleport = document.getElementById('bottombar-teleport');
  const bottombarHelp = document.getElementById('bottombar-help');

  // Controls are grouped by situation and open on the one the player is in,
  // so they read ~8 keys plus the general block instead of all 30.
  const helpCard = helpModal?.querySelector('.help-card');
  const setHelpTab = (tab) => {
    if (!helpCard) return;
    helpCard.dataset.tab = tab;
    for (const btn of helpCard.querySelectorAll('[data-help-tab]')) btn.classList.toggle('active', btn.dataset.helpTab === tab);
  };
  helpCard?.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-help-tab]')?.dataset.helpTab;
    if (tab) setHelpTab(tab);
  });

  function openHelpModal() {
    closeTeleportModal();
    const inStation = stationlife.state.riding || player.feetY > 3;
    setHelpTab(window.__mirpur.drive?.driving ? 'drive' : inStation ? 'metro' : 'foot');
    if (helpModal) helpModal.classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function closeHelpModal() {
    if (helpModal) helpModal.classList.add('hidden');
  }

  let currentTeleportCategory = 'all';

  function renderTeleportGrid(filterCategory = 'all', query = '') {
    if (!teleportGrid) return;
    teleportGrid.innerHTML = '';

    const filtered = ALL_TELEPORT_PLACES.filter((place) => {
      const matchCategory = filterCategory === 'all' || place.category === filterCategory;
      if (!matchCategory) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        (place.name && place.name.toLowerCase().includes(q)) ||
        (place.bn && place.bn.includes(q)) ||
        (place.desc && place.desc.toLowerCase().includes(q)) ||
        (place.districtLabel && place.districtLabel.toLowerCase().includes(q))
      );
    });

    if (filtered.length === 0) {
      teleportGrid.innerHTML = `<div style="grid-column: 1 / -1; padding: 32px; text-align: center; color: var(--dim); font-size: 13.5px;">No destinations found matching "${query}".</div>`;
      return;
    }

    // Instant jumps first, nearest first; metro journeys to other districts
    // after them, under their own heading, so the two kinds never look alike.
    const isLocalPlace = (place) => place.district === district.key || place.district === 'current';
    const distanceTo = (place) => (place.x == null ? 0 : Math.hypot(place.x - player.position.x, place.z - player.position.z));
    const local = filtered.filter(isLocalPlace).sort((p, q) => distanceTo(p) - distanceTo(q));
    const remote = filtered.filter((place) => !isLocalPlace(place));

    const addHeading = (label, note) => {
      const heading = document.createElement('div');
      heading.className = 'place-group';
      heading.innerHTML = `<b>${label}</b><span>${note}</span>`;
      teleportGrid.appendChild(heading);
    };

    const addCard = (place, isLocal) => {
      const metres = distanceTo(place);
      const distance = !isLocal || place.x == null ? '' : metres < 30 ? tr('You are here') : metres < 1000 ? `${num(Math.round(metres / 10) * 10)} m` : `${num((metres / 1000).toFixed(1))} km`;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `place-card ${isLocal ? 'is-local' : 'is-metro'}`;
      card.innerHTML = `
        ${placeLocatorSvg(place, isLocal)}
        <div class="place-body">
          <div class="place-name">${localName(place)}</div>
          <div class="place-bn">${getLang() === 'bn' ? place.name : place.bn || ''}</div>
          <div class="place-desc">${place.desc || ''}</div>
        </div>
        <div class="place-card-footer">
          <span class="district-pill ${isLocal ? 'is-active' : ''}">${isLocal ? distance : tr(place.districtLabel)}</span>
          <span class="teleport-action-btn">${isLocal ? `⚡ ${tr('Teleport')}` : `🚇 ${tr('Ride the metro')}`}</span>
        </div>
      `;
      card.addEventListener('click', () => executeTeleport(place));
      teleportGrid.appendChild(card);
    };

    if (local.length) addHeading(tr('Here'), 'Instant teleport · nearest first');
    for (const place of local) addCard(place, true);
    if (remote.length) addHeading(tr('By metro'), 'Another district · you ride MRT Line 6 there');
    for (const place of remote) addCard(place, false);
  }

  /**
   * Thumbnail for a Travel card: the district's stretch of MRT Line 6 with the
   * place marked on it (and the player, when it is this district). There are
   * no per-place photos in the repo, and this costs no bytes.
   */
  function placeLocatorSvg(place, isLocal) {
    const key = place.district === 'current' ? district.key : place.district;
    const line = ALL_DISTRICT_STATIONS.filter((st) => st.district === key);
    const target = place.x == null ? null : { x: place.x, z: place.z };
    const me = isLocal ? { x: player.position.x, z: player.position.z } : null;
    const pts = [...line, target, me].filter(Boolean);
    if (pts.length < 2) return '<svg class="place-locator" viewBox="0 0 56 56" aria-hidden="true"></svg>';
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minZ = Math.min(...pts.map((p) => p.z));
    const maxZ = Math.max(...pts.map((p) => p.z));
    const scale = 40 / Math.max(maxX - minX, maxZ - minZ, 1);
    const px = (p) => (8 + (p.x - minX) * scale + (40 - (maxX - minX) * scale) / 2).toFixed(1);
    const pz = (p) => (8 + (p.z - minZ) * scale + (40 - (maxZ - minZ) * scale) / 2).toFixed(1);
    const track = line.map((st) => `${px(st)},${pz(st)}`).join(' ');
    const stops = line.map((st) => `<circle cx="${px(st)}" cy="${pz(st)}" r="1.8" class="stop"/>`).join('');
    const you = me ? `<circle cx="${px(me)}" cy="${pz(me)}" r="2.6" class="you"/>` : '';
    const mark = target ? `<circle cx="${px(target)}" cy="${pz(target)}" r="4" class="mark"/>` : '';
    return `<svg class="place-locator" viewBox="0 0 56 56" aria-hidden="true"><polyline points="${track}" class="track"/>${stops}${you}${mark}</svg>`;
  }

  function executeTeleport(place) {
    closeTeleportModal();

    // Special vantage: Aerial sky vista over the corridor & city skyline
    if (place.isAerial) {
      const mx = (primaryStation.x + (secondaryStation?.x ?? primaryStation.x)) / 2;
      const mz = (primaryStation.z + (secondaryStation?.z ?? primaryStation.z)) / 2;
      const camX = mx + 110;
      const camZ = mz + 230;
      const camY = 160;
      const lookYaw = Math.atan2(primaryStation.x - camX, primaryStation.z - camZ);
      switchTeleport(camX, camZ, camY, lookYaw, place.name || 'AERIAL SKY VISTA', -0.25, true);
      return;
    }

    // Special vantage: Platform deck
    if (place.isPlatform) {
      let targetStation = primaryStation;
      let bestDist = Infinity;
      for (const st of metro.stations) {
        const d = Math.hypot(st.x - player.position.x, st.z - player.position.z);
        if (d < bestDist) {
          bestDist = d;
          targetStation = st;
        }
      }
      const posX = targetStation.x + Math.cos(targetStation.heading) * 4.55;
      const posZ = targetStation.z - Math.sin(targetStation.heading) * 4.55;
      switchTeleport(posX, posZ, METRO.PLATFORM_Y + 1.68, targetStation.heading, targetStation.name + ' PLATFORM');
      return;
    }

    // Station in active district
    if (place.isStation && place.district === district.key) {
      const st = metro.stations.find((s) => s.name === place.stationName) || primaryStation;
      const spot = stationApproach(st, -1, startYaw);
      switchTeleport(spot.x, spot.z, 1.68, spot.yaw, place.name || place.stationName);
      return;
    }

    // Landmark in active district
    if (place.district === district.key) {
      switchTeleport(place.x, place.z, place.y ?? 1.68, place.yaw ?? startYaw, place.name);
      return;
    }

    // Destination is in another district: trigger smooth journey reload
    travelTo(
      place.district,
      place.isStation ? place.stationName : null,
      place.isStation ? null : { x: place.x, z: place.z, y: place.y }
    );
  }

  function openTeleportModal() {
    closeHelpModal();
    if (teleportModal) {
      teleportModal.classList.remove('hidden');
      renderTeleportGrid(currentTeleportCategory, teleportSearch ? teleportSearch.value.trim().toLowerCase() : '');
      if (teleportSearch) teleportSearch.focus();
    }
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function closeTeleportModal() {
    if (teleportModal) teleportModal.classList.add('hidden');
  }

  // Populate category badge counts
  const countAll = document.getElementById('count-all');
  const countStation = document.getElementById('count-station');
  const countLandmark = document.getElementById('count-landmark');
  const countVantage = document.getElementById('count-vantage');
  if (countAll) countAll.textContent = ALL_TELEPORT_PLACES.length;
  if (countStation) countStation.textContent = ALL_TELEPORT_PLACES.filter((p) => p.category === 'station').length;
  if (countLandmark) countLandmark.textContent = ALL_TELEPORT_PLACES.filter((p) => p.category === 'landmark').length;
  if (countVantage) countVantage.textContent = ALL_TELEPORT_PLACES.filter((p) => p.category === 'vantage').length;

  // Category tab buttons
  const tabBtns = document.querySelectorAll('.teleport-tabs .tab-btn');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentTeleportCategory = btn.dataset.filter;
      renderTeleportGrid(currentTeleportCategory, teleportSearch ? teleportSearch.value.trim().toLowerCase() : '');
    });
  });

  // Search input and clear button
  teleportSearch?.addEventListener('input', () => {
    const query = teleportSearch.value.trim().toLowerCase();
    teleportSearchClear?.classList.toggle('hidden', query.length === 0);
    renderTeleportGrid(currentTeleportCategory, query);
  });
  teleportSearchClear?.addEventListener('click', () => {
    if (teleportSearch) {
      teleportSearch.value = '';
      teleportSearchClear.classList.add('hidden');
      renderTeleportGrid(currentTeleportCategory, '');
      teleportSearch.focus();
    }
  });

  // Help & Teleport button listeners
  helpCloseBtn?.addEventListener('click', closeHelpModal);
  helpOpenTeleport?.addEventListener('click', () => {
    closeHelpModal();
    openTeleportModal();
  });
  teleportCloseBtn?.addEventListener('click', closeTeleportModal);
  teleportBtn?.addEventListener('click', openTeleportModal);
  bottombarTeleport?.addEventListener('click', openTeleportModal);
  bottombarHelp?.addEventListener('click', openHelpModal);

  // Click outside modal card dismisses modal
  helpModal?.addEventListener('click', (e) => {
    if (e.target === helpModal) closeHelpModal();
  });
  teleportModal?.addEventListener('click', (e) => {
    if (e.target === teleportModal) closeTeleportModal();
  });
  if (window.__mirpur) {

    window.__mirpur.openTeleportModal = openTeleportModal;
    window.__mirpur.closeTeleportModal = closeTeleportModal;
    window.__mirpur.openHelpModal = openHelpModal;
    window.__mirpur.closeHelpModal = closeHelpModal;
    window.__mirpur.executeTeleport = executeTeleport;
  }

  clearInterval(tipTimer);

  loadingEl.setAttribute('aria-busy', 'false');
  loadingEl.classList.add('hidden');
  startPanel.classList.remove('hidden');

  if (district.key === 'north' && !arriveStation && teleportX == null) {
    camera.position.set(-276, 30, -1530);
    camera.lookAt(-266, 17, -1377);
  }
  const firstJourney = createFirstJourney({ host: hud, position: player.position, location: () => startStationName ?? (district.key === 'north' && !arriveStation && teleportX == null ? 'Pallabi' : district.label) });
  const mobileControls = createMobileControls({
    player,
    getDrive: () => window.__mirpur.drive,
    isBlocked: () => introCinematic.active || switchCamera.active,
    onInteract: () => interactWithWorld(),
  });
  const beginButton = document.getElementById('begin');
  if (teleportX != null || arriveStation) {
    const destName = arriveStation || district.destinations?.find((d) => Math.hypot(d.x - teleportX, d.z - teleportZ) < 120)?.name || district.label;
    if (beginButton) beginButton.textContent = `Enter ${destName}`;
    document.getElementById('intro-note').textContent = 'Continue your journey from here.';
  }
  function enterStreet() {
    camera.position.copy(player.position);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
    hud.classList.remove('hidden');
    resize();
    firstJourney.start();
    player.requestLock();
  }
  function beginJourney(withIntro) {
    if (beginJourney.started) return;
    beginJourney.started = true;
    startPanel.classList.add('hidden');
    resize();
    ensureAudioContext();
    if (!withIntro || arriveStation || teleportX != null) {
      enterStreet();
      return;
    }
    introCinematic.start({ onComplete: enterStreet });
  }
  beginButton.addEventListener('click', () => beginJourney(true));
  const beginDirectButton = document.getElementById('begin-direct');
  beginButton.focus({ preventScroll: true });
  beginDirectButton.addEventListener('click', () => beginJourney(false));
  // The splash is intentionally forgiving on touch devices and trackpads:
  // any click on the open panel that is not a control enters free roam.
  startPanel.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button, summary, input, label, a')) return;
    beginJourney(false);
  });

  const modeEl = document.getElementById('mode');
  const refreshModeLabel = () => {
    modeEl.textContent = tr(stationlife.state.riding ? 'Metro' : window.__mirpur.drive?.driving ? 'Drive' : player.flying ? 'Fly' : 'Walk');
  };
  let wasLocked = false;
  let pauseOpenedAt = 0;
  player.on('modechange', ({ locked }) => {
    refreshModeLabel();
    hud.classList.toggle('unlocked', !locked);
    // Esc releases pointer lock before any keydown reaches the page (Chrome
    // never delivers it), so losing the lock with nothing else on screen IS
    // the pause gesture. Panels un-hide themselves before they unlock, which
    // is what keeps isGameplayBlocked() true for them here.
    if (wasLocked && !locked && !hud.classList.contains('hidden') && !isGameplayBlocked() &&
        !player.switching && !player.inLift && !introCinematic.active && !switchCamera.active) {
      gameMenu.openPause();
      pauseOpenedAt = performance.now();
    }
    wasLocked = locked;
  });

  canvas.addEventListener('click', () => {
    if (introCinematic.active) return;
    if (!startPanel.classList.contains('hidden')) return;
    if (!gatewayEl.classList.contains('hidden')) return; // don't re-lock behind the through-service popup
    if (helpModal && !helpModal.classList.contains('hidden')) return;
    if (teleportModal && !teleportModal.classList.contains('hidden')) return;
    if (gameMenu.open) return;
    player.requestLock();
  });

  // Time of day cycling.
  const timeKeys = Object.keys(TIMES_OF_DAY);
  let timeIndex = timeKeys.indexOf('midday');
  const applyTime = () => {
    const label = sky.setTime(timeKeys[timeIndex]);
    timeLabel.textContent = tr(label);
  };
  applyTime();

  // Pause menu, Settings, Photo mode (src/game-menu.js).
  const gameMenu = createGameMenu({
    canvas,
    debugMode,
    apply: {
      volume: setVolume,
      sensitivity: (v) => { player.lookScale = v; },
      quality: (q) => perfGovernor.setMax(q === 'performance' ? Math.max(PIXEL_RATIO_MIN, PIXEL_RATIO_MAX * 0.67) : PIXEL_RATIO_MAX),
      stats: (on) => { statsEl.hidden = !on; },
    },
    onResume: () => player.requestLock(),
    openHelp: openHelpModal,
    openTravel: openTeleportModal,
  });
  document.getElementById('bottombar-menu')?.addEventListener('click', () => gameMenu.openPause());

  const topbarTitle = document.querySelector('#topbar .title');
  const refreshLanguage = () => {
    applyI18n();
    refreshModeLabel();
    timeLabel.textContent = tr(TIMES_OF_DAY[timeKeys[timeIndex]].label);
    if (topbarTitle) topbarTitle.textContent = tr('Mirpur corridor');
    document.getElementById('topbar')?.setAttribute('data-eyebrow', tr('DHAKA / FREE ROAM'));
    hud.dataset.unlockedHint = tr('Click to look around');
    const teleportBtnEl = document.getElementById('teleport-btn');
    if (teleportBtnEl) teleportBtnEl.textContent = tr('Travel · O');
    minimap.refreshLabels?.();
    if (teleportModal && !teleportModal.classList.contains('hidden')) renderTeleportGrid(currentTeleportCategory, teleportSearch ? teleportSearch.value.trim().toLowerCase() : '');
  };
  window.addEventListener('mirpur:lang', refreshLanguage);
  refreshLanguage();

  // Quick travel and view controls.
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (introCinematic.active || !startPanel.classList.contains('hidden') || e.repeat) return;
    const code = normalizeKeyCode(e);
    if (player.inLift || document.querySelector('#lift-menu:not(.hidden)')) return;
    if (code !== 'Escape' && e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName))) return;
    if (gameMenu.open && code !== 'Escape') return;
    if (isGameplayBlocked() && !['Escape', 'KeyM', 'KeyH', 'KeyO', 'KeyT'].includes(code)) return;

    // P13-E: cross-district jump, on whichever digit the "Jump to" line above
    // computed it onto. Checked ahead of the switch (a dynamic digit can't be
    // a `case` label) and BEFORE the district even knows a station gateway —
    // reuses openGatewayModal exactly like boarding the platform gate does,
    // so the player still sees which stations are skipped and can back out
    // with Stay/Esc rather than reloading silently on a keypress. No-op when
    // crossDistrictJump is null (the `old` district has no gateway).
    if (crossDistrictJump && code === `Digit${gatewayDigit}`) {
      openGatewayModal(crossDistrictJump.gateway);
      return;
    }

    switch (code) {
      case 'KeyT':
        if (minimap.expanded && minimap.waypoint) {
          minimap.teleportTo(minimap.waypoint.x, minimap.waypoint.z, minimap.waypoint.name);
          break;
        }
        timeIndex = (timeIndex + 1) % timeKeys.length;
        applyTime();
        // P11-C (corrected): the env map itself is a fixed RoomEnvironment
        // PMREM generated once at startup and never re-probed. Day/night
        // response is just an intensity tweak here, not a regeneration.
        setEnvironmentIntensity();
        break;
      case 'Digit1': {
        // Digit1 always targets quickTravel[0] (primaryStation) — Mirpur 10
        // on the north map, Bijoy Sarani on the Bijoy map.
        const spot = stationApproach(primaryStation, -1, startYaw);
        switchTeleport(spot.x, spot.z, 1.68, spot.yaw, primaryStation.name);
        break;
      }
      case 'Digit2':
        if (secondaryStation) {
          // North of the second station, facing back down the corridor.
          const spot = stationApproach(secondaryStation, 1, startYaw + Math.PI);
          switchTeleport(spot.x, spot.z, 1.68, spot.yaw, secondaryStation.name);
        }
        break;
      case 'Digit3': {
        // Up on the platform: targets the nearest station (e.g. Mirpur 11 if nearby)
        // or primaryStation fallback. Places player on the platform deck in walk mode.
        let targetStation = primaryStation;
        let bestDist = Infinity;
        for (const st of metro.stations) {
          const d = Math.hypot(st.x - player.position.x, st.z - player.position.z);
          if (d < bestDist) {
            bestDist = d;
            targetStation = st;
          }
        }
        const posX = targetStation.x + Math.cos(targetStation.heading) * 4.55;
        const posZ = targetStation.z - Math.sin(targetStation.heading) * 4.55;
        switchTeleport(
          posX,
          posZ,
          METRO.PLATFORM_Y + 1.68,
          targetStation.heading,
          targetStation.name + ' PLATFORM'
        );
        break;
      }
      case 'Digit4': {
        // Aerial sky view over the corridor & city skyline.
        const mx = (primaryStation.x + (secondaryStation?.x ?? primaryStation.x)) / 2;
        const mz = (primaryStation.z + (secondaryStation?.z ?? primaryStation.z)) / 2;
        const camX = mx + 110;
        const camZ = mz + 230;
        const camY = 160;
        const lookYaw = Math.atan2(primaryStation.x - camX, primaryStation.z - camZ);
        switchTeleport(camX, camZ, camY, lookYaw, 'AERIAL SKY VISTA', -0.25, true);
        break;
      }
      case 'Digit5':
      case 'Digit6': {
        // Digit5/6 -> quickTravel[4]/[5] (Mirpur 10/Uttara South on the
        // north map since P13-D reordered slot 0 to Pallabi; Farmgate/null
        // on Bijoy Sarani's). A missing slot is a no-op, same as it always
        // was on the old two-station scene.
        const st = stationForDigit(normalizeKeyCode(e) === 'Digit5' ? 4 : 5);
        if (st) {
          const spot = stationApproach(st, -1, startYaw);
          switchTeleport(spot.x, spot.z, 1.68, spot.yaw, st.name);
        }
        break;
      }
      case 'Digit7': {
        // P13-D: named, non-metro destinations (district.destinations) get
        // digit slots starting right after the station jumps — today that's
        // always just Digit7, for bijoy's Jatiya Sangsad Bhaban viewpoint.
        // Ground-level, not flying, since it's a street/avenue vantage
        // point, not a platform or aerial preset.
        const dest = destinations.find((d) => digitForDestination(d) === 7);
        if (dest) {
          switchTeleport(dest.x, dest.z, dest.y ?? 1.68, dest.yaw ?? 0, dest.name);
        }
        break;
      }
      case 'KeyM':
        // M opens the full map (owner request 2026-09-07: "clicking M doesn't
        // open the full map ... with zooming etc like games"). It used to
        // just hide the corner minimap; the minimap now stays up.
        setMapExpanded();
        break;
      case 'Backquote':
        gameMenu.toggleStats();
        break;
      case 'KeyG':
        if (!isGameplayBlocked()) gameMenu.togglePhotoMode();
        break;
      case 'Enter':
        gameMenu.requestCapture();
        break;
      case 'Escape':
        if (gameMenu.open) {
          // Firefox delivers this same Esc after the lock-loss already opened the menu.
          if (performance.now() - pauseOpenedAt > 300) gameMenu.escape();
          break;
        }
        // Esc closes the through-service popup first, then the teleport modal,
        // then the help modal, then the whole-map view; the browser's own Esc
        // still releases pointer lock when neither is open.
        if (!gatewayEl.classList.contains('hidden')) closeGatewayModal();
        else if (teleportModal && !teleportModal.classList.contains('hidden')) closeTeleportModal();
        else if (helpModal && !helpModal.classList.contains('hidden')) closeHelpModal();
        else if (minimap.expanded) setMapExpanded(false);
        else if (gameMenu.photoMode) gameMenu.togglePhotoMode();
        else if (!player.locked) gameMenu.openPause();
        break;
      case 'KeyH':
        if (helpModal && !helpModal.classList.contains('hidden')) closeHelpModal();
        else openHelpModal();
        break;
      case 'KeyO':
        // The modal focuses its search box; without this the same keypress types an "o" into it.
        e.preventDefault();
        if (teleportModal && !teleportModal.classList.contains('hidden')) closeTeleportModal();
        else openTeleportModal();
        break;

      case 'KeyE': {
        // P11-J: boarding/riding/alighting takes precedence over the
        // concourse interactables (ticket gates etc.) when it has something
        // to do (boarding a train or getting off one); otherwise fall
        // through to interior.interact() exactly as before this pass.
        interactWithWorld();
        break;
      }
      case 'KeyJ':
        streetlife.toggleJournal();
        break;
      default:
        break;
    }
  });

  // -------------------------------------------------------------------------
  // Frame loop
  // -------------------------------------------------------------------------
  const clock = new THREE.Clock();
  let elapsed = 0;
  let frames = 0;
  let fps = 0;
  // FPS is measured on the wall clock, not the clamped simulation dt, so a
  // long hitch shows up honestly; worstMs is the slowest frame in the window.
  let fpsWindowStart = performance.now();
  let lastFrameAt = fpsWindowStart;
  let worstMs = 0;

  function nearestLandmark(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const s of metro.stations) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return { name: best?.name ?? '', bn: best?.bn, distance: Math.round(bestD) };
  }

  let frameCount = 0;

  function frame() {
    requestAnimationFrame(frame);

    const dt = Math.min(clock.getDelta(), 0.1);
    elapsed += dt;
    frameCount++;
    const evenFrame = (frameCount & 1) === 0;

    metro.update(elapsed);
    mobileControls.update();
    // Intro cinematic and GTA V switch-camera transitions take precedence over player movement
    if (introCinematic.active) {
      introCinematic.update(dt);
    } else if (switchCamera.active) {
      switchCamera.update(dt);
    } else if (!stationlife.state.riding && !player.inLift && !player.inRide) {
      player.update(dt);
    }
    // Streaming + LOD (docs/STREAMING.md, docs/LOD-PASS.md): called
    // unconditionally off the active view position every frame, both walking,
    // flying, driving, switching camera, or playing intro.
    const activePos = (introCinematic.active || switchCamera.active) ? camera.position : player.position;
    updateBuildingLOD(activePos.x, activePos.z);
    neighbourhoodDetails.update(activePos.x, activePos.z);
    worldDetails.update(activePos.x, activePos.z);
    sky.update(activePos, elapsed);
    sky.updateClouds(activePos, elapsed);
    const stationlifeLine = stationlife.update(dt, player);
    traffic.update(dt, elapsed);
    night.update(player.position, dt);

    // Non-critical systems run at half rate (~30 Hz) to save CPU. They receive
    // doubled dt so motion/physics stay smooth; visually the difference is
    // unnoticeable for a small corner minimap, distant pedestrians, cloud drift,
    // and already-fallen pole animations.
    if (evenFrame) {
      peds.update(dt * 2, elapsed);
      destructibles.update(dt * 2);
      // P11-N: third arg drives the minimap's day/night base bitmap. It is
      // optional in Minimap.update() (omitting it keeps the old daytime-only
      // behaviour), and the minimap smooths the transition itself, so passing
      // the raw boolean here is enough -- no per-frame work is added.
      minimap.update(player.position, player.yaw, sky.isDark);
    }
    const audioPosition = introCinematic.active ? camera.position : player.position;
    worldAudio.update(dt, { x: audioPosition.x, y: audioPosition.y, z: audioPosition.z, yaw: introCinematic.active ? camera.rotation.y : player.yaw, insideMetro: stationlife.state.riding || (introCinematic.active && introCinematic.status.shot === 1) }, stationlife.state.trains);
    // Precedence: stationlife's line (boarding/riding/alighting) wins
    // whenever it has one — it's the more time-critical interaction (a
    // closing door or a departing train) — falling back to interior's
    // concourse/gate line otherwise. Always run interior.update() so station
    // interiors and walkable slabs are loaded even when riding.
    const interiorLine = interior.update(dt, player);
    stationPromptShown = !!(stationlifeLine || interiorLine);
    const streetSuspended = hud.classList.contains('hidden') || introCinematic.active || switchCamera.active ||
      stationlife.state.riding || player.inLift || (window.__mirpur.drive?.driving ?? false);
    const streetLine = streetlife.update(dt, elapsed, streetSuspended);
    setInteraction(streetlife.riding ? streetLine : stationlifeLine || interiorLine || streetLine);
    updateTransitHud();
    boundaryEl.classList.toggle('hidden', !player.leavingMirpur);
    firstJourney.update(dt, window.__mirpur.drive?.driving ?? false, isGameplayBlocked() || player.feetY > 1 || stationlife.state.riding || player.inLift || introCinematic.active || switchCamera.active || minimap.expanded || !helpModal.classList.contains('hidden') || !teleportModal.classList.contains('hidden') || !gatewayEl.classList.contains('hidden'));

    // Defensive: a material/uniform mismatch elsewhere in the scene graph
    // (seen this pass from a concurrently-edited file) must not stop the
    // frame loop — that would make player/interior state untestable. Log
    // once so whoever owns the failing material sees it, then keep going;
    // three.js usually recovers once the offending material's program is
    // recompiled on a later frame.
    try {
      renderer.render(scene3, camera);
      gameMenu.afterRender();
    } catch (err) {
      if (!frame._loggedRenderError) {
        frame._loggedRenderError = true;
        console.error('renderer.render threw (frame loop continuing):', err);
      }
    }

    frames++;
    const frameAt = performance.now();
    // Loading screens and the intro render a different, cheaper view; only
    // let real gameplay frames steer the resolution.
    if (!hud.classList.contains('hidden')) perfGovernor.tick(frameAt);
    worstMs = Math.max(worstMs, frameAt - lastFrameAt);
    lastFrameAt = frameAt;
    if (frameAt - fpsWindowStart >= 500) {
      fps = Math.round((frames * 1000) / (frameAt - fpsWindowStart));
      frames = 0;
      fpsWindowStart = frameAt;

      const info = renderer.info.render;
      const lm = nearestLandmark(player.position.x, player.position.z);
      // Phones and narrow windows get just the number; the rest won't fit.
      const compactStats = window.innerWidth <= 760 || document.body.classList.contains('touch-game');
      if (!statsEl.hidden) statsEl.textContent = compactStats
        ? `${fps} FPS`
        : `${fps} FPS  ·  worst ${Math.round(worstMs)} ms  ·  ${info.calls} draws  ·  ${(info.triangles / 1000).toFixed(0)}k tris  ·  ${perfGovernor.ratio.toFixed(2)}x`;
      statsEl.dataset.level = fps >= 50 ? 'good' : fps >= 30 ? 'ok' : 'bad';
      worstMs = 0;
      locationEl.textContent = lm.distance < 3000 ? distanceFrom(lm.distance, lm) : '';
    }
  }

  frame();
}

main().catch((err) => {
  console.error(err);
  loadingText.innerHTML = `<span style="color:#e08a7a">Failed to start: ${err.message}</span>`;
});
