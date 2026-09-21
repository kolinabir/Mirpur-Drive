/**
 * drive.js — High-Performance Sports Car Simulation
 *
 * GTA-Style Driving Dynamics & Multi-Camera Perspective:
 * - Glued-to-the-road, responsive, intuitive arcade sports car handling
 *   (tight low-speed turning radius, high-speed stability assist, zero floatiness).
 * - Effortless GTA-style power slides on Handbrake (Space) with instant grip recovery.
 * - 5 GTA Camera Angles (C key cycles with on-screen GTA toast):
 *   1. GTA Chase Close (low, tight, sporty)
 *   2. GTA Chase Far (elevated wide cinematic view)
 *   3. GTA First-Person Cockpit (inside driver's seat looking through windshield)
 *   4. GTA Hood / Bonnet (mounted low on the hood)
 *   5. GTA Bumper (asphalt-level racing view)
 * - Mouse Look Orbit (pan 360° around the car; smoothly springs back)
 * - Quick Look-Behind / Rear-View Mirror (hold R key)
 * - 3D Sports Model (`sedan-sports.glb`) with active airbrake spoiler,
 *   twin exhaust flame pops, glowing brake rotors, and projector headlights.
 * - Multi-harmonic sports engine audio with dynamic tire screech.
 * - Canvas cockpit tachometer with digital speedometer and drift scoring.
 */

import * as THREE from 'three';
import { touchInput, isGameplayBlocked, isEditableTarget } from './mobile-controls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { resolveCollision } from './city.js';
import { ensureAudioContext, setMuted as setSharedMuted } from './audio.js';
import { loadModel, cloneModel } from './models.js';
import { tr } from './i18n.js';
import { buildCoupeBody, buildCoupeWheel } from './car-body.js';
import { createCarEnvironment } from './car-environment.js';

// ---------------------------------------------------------------------------
// Physical Dimensions & Car Constants
// ---------------------------------------------------------------------------
const HALF_L = 2.30; // m, half body length (4.6m sports sedan)
const HALF_W = 0.94; // m, half body width (1.88m wide sports stance)
const BODY_HEIGHT = 1.38; // m, lowered sports car roofline
const WHEEL_RADIUS = 0.32; // m
const WHEELBASE = 2.70; // m
const DIST_FRONT = 1.35; // m
const DIST_REAR = 1.35; // m
const CAR_COLLIDE_Y = 1.45; // m
const CORNER_RADIUS = 0.35; // m, corner pushout radius (keeps effective body width ~2.58m so narrow roads remain passable)

// Speed tunables
const MAX_SPEED_FORWARD = 36; // ~130 km/h (ideal for Mirpur's street network & flyover)
const MAX_SPEED_REVERSE = 12; // ~43 km/h
const ACCEL_FORWARD = 13.0; // m/s^2 forward punch
const BRAKE_DECEL = 26.0; // m/s^2 straight-line stopping power
const REVERSE_ACCEL = 7.0; // m/s^2
const COAST_DRAG = 3.5; // m/s^2 natural engine coasting drag

// Steering tunables (Speed-sensitive, progressive arcade sports handling)
const MAX_STEER_LOW_SPEED = 0.48; // rad (~27.5 deg) for effortless tight street corners
const MAX_STEER_HIGH_SPEED = 0.09; // rad (~5.1 deg) for high-speed highway stability
const STEER_IN_LERP = 5.5; // smooth keyboard turn-in (no instant snapping)
const STEER_RETURN_LERP = 8.8; // crisp, self-centering return
const YAW_FOLLOW_RATE = 11.0; // angular momentum smoothing (eliminates twitchy jitter)

// Audio RPM
const IDLE_RPM = 950;
const REDLINE_RPM = 8000;

// Crash response constants
const CRASH_RESTITUTION = 0.22;
const CRASH_TANGENT_FRICTION = 1.8;
const CRASH_ANGULAR_SCALE = 0.10;
const CRASH_YAW_RATE_MAX = 2.5;
const CRASH_SEVERITY_SPEED = 9.0;

// Skidmark & Smoke constants
const SKID_CAP = 300;
const SMOKE_CAP = 40;
const SKID_SPACING = 0.45;

// ---------------------------------------------------------------------------
// Camera Presets (GTA Style)
// ---------------------------------------------------------------------------
const GTA_CAMERA_MODES = [
  { id: 0, name: 'Chase Close', type: 'chase', dist: 5.4, height: 2.1, lookY: 1.0, fov: 68 },
  { id: 1, name: 'Chase Far', type: 'chase', dist: 8.5, height: 3.2, lookY: 1.1, fov: 64 },
  { id: 2, name: 'Cockpit View', type: 'cockpit', posX: -0.36, posY: 1.12, posZ: -0.05, fov: 74 },
  { id: 3, name: 'Hood Cam', type: 'hood', posX: 0, posY: 1.02, posZ: 0.60, fov: 72 },
  { id: 4, name: 'Bumper Cam', type: 'bumper', posX: 0, posY: 0.38, posZ: HALF_L + 0.15, fov: 76 },
];

// ---------------------------------------------------------------------------
// Vehicle Presets & Model Loading
// ---------------------------------------------------------------------------
const CAR_PRESETS = [
  {
    id: 'sedan-sports',
    name: 'GT Sports Coupe',
    url: '/models/car-kit/sedan-sports.glb',
    scaleY: 1.38,
    hasSpoiler: true,
  },
  {
    id: 'suv-luxury',
    name: 'V8 Luxury SUV',
    url: '/models/car-kit/suv-luxury.glb',
    scaleY: 1.58,
    hasSpoiler: false,
  },
  {
    id: 'hatchback-sports',
    name: 'Rally Hot Hatch',
    url: '/models/car-kit/hatchback-sports.glb',
    scaleY: 1.40,
    hasSpoiler: false,
  },
  {
    id: 'sedan',
    name: 'Executive Sedan',
    url: '/models/car-kit/sedan.glb',
    scaleY: 1.42,
    hasSpoiler: false,
  },
];
let currentCarPresetIndex = 0;
const carTemplates = new Map();

const textureLoader = new THREE.TextureLoader();
const carColormapTexture = textureLoader.load('/models/car-kit/Textures/colormap.png');
carColormapTexture.colorSpace = THREE.SRGBColorSpace;

CAR_PRESETS.forEach((preset) => {
  loadModel(preset.url)
    .then((scene) => {
      carTemplates.set(preset.id, scene);
    })
    .catch((err) => {
      console.warn(`[drive.js] Failed to load preset ${preset.id}:`, err);
    });
});

// ---------------------------------------------------------------------------
// Environment Map & Shared Materials
// ---------------------------------------------------------------------------
let carEnvMap = null;
let carPaintMat = null;
let carGlassMat = null;
let carAeroMat = null;
let carRotorMat = null;

function ensureCarEnvMap(renderer) {
  if (carEnvMap) return carEnvMap;
  try {
    carEnvMap = createCarEnvironment(renderer);
  } catch (err) {
    console.warn('[drive.js] Outdoor reflections unavailable:', err);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    try {
      carEnvMap = pmrem.fromScene(room, 0.04).texture;
    } finally {
      room.dispose();
      pmrem.dispose();
    }
  }
  return carEnvMap;
}

function ensureSportsMaterials(envMap) {
  if (!carPaintMat) {
    carPaintMat = new THREE.MeshPhysicalMaterial({
      color: 0xd6162b, // Deep Racing Crimson Red
      metalness: 0.72,
      roughness: 0.22,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.35,
    });
  }
  if (!carGlassMat) {
    carGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x05070a,
      metalness: 0.25,
      roughness: 0.05,
      clearcoat: 0.95,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.5,
    });
  }
  if (!carAeroMat) {
    carAeroMat = new THREE.MeshPhysicalMaterial({
      color: 0x141517,
      metalness: 0.35,
      roughness: 0.20,
      clearcoat: 0.85,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.1,
    });
  }
  if (!carRotorMat) {
    carRotorMat = new THREE.MeshStandardMaterial({
      color: 0x7b8288,
      metalness: 0.88,
      roughness: 0.26,
      emissive: new THREE.Color(0xff2200),
      emissiveIntensity: 0.0,
    });
  }
  carPaintMat.envMap = envMap;
  carGlassMat.envMap = envMap;
  carAeroMat.envMap = envMap;
  carRotorMat.envMap = envMap;
  return { carPaintMat, carGlassMat, carAeroMat, carRotorMat };
}

function makeContactShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 15, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.40)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);

  const geo = new THREE.PlaneGeometry(HALF_W * 2.4, HALF_L * 2.3);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.02;
  return mesh;
}

// ---------------------------------------------------------------------------
// 3D Car Construction: Active Wing, Rotors, Exhaust Flames & Headlights
// ---------------------------------------------------------------------------
const WHEEL_DEFS = [
  ['wFL', 0.90, -DIST_FRONT],
  ['wFR', -0.90, -DIST_FRONT],
  ['wRL', 0.90, DIST_REAR],
  ['wRR', -0.90, DIST_REAR],
];

function makeWheelPivots(group, wheelMeshFactory, envMap, rotorMat) {
  const wheels = {};
  const caliperMat = new THREE.MeshStandardMaterial({
    color: 0xd41111,
    roughness: 0.35,
    metalness: 0.3,
  });

  const rotorGeo = new THREE.CylinderGeometry(0.20, 0.20, 0.024, 16);
  rotorGeo.rotateZ(Math.PI / 2);
  const caliperGeo = new THREE.BoxGeometry(0.07, 0.12, 0.07);

  for (const [key, x, z] of WHEEL_DEFS) {
    const pivot = new THREE.Group();
    pivot.position.set(x, WHEEL_RADIUS, z);

    const mesh = wheelMeshFactory(key);
    pivot.add(mesh);

    const rotor = new THREE.Mesh(rotorGeo, rotorMat);
    rotor.position.set(x > 0 ? -0.05 : 0.05, 0, 0);
    pivot.add(rotor);

    const caliper = new THREE.Mesh(caliperGeo, caliperMat);
    caliper.position.set(x > 0 ? -0.05 : 0.05, 0.11, 0);
    pivot.add(caliper);

    group.add(pivot);
    wheels[key] = { pivot, mesh, rotor, caliper };
  }
  return wheels;
}

function makeLamps(bodyPivot) {
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xd8eeff,
    emissiveIntensity: 2.5,
    roughness: 0.12,
    metalness: 0.20,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff1111,
    emissive: 0xee1111,
    emissiveIntensity: 0.65,
    roughness: 0.20,
    metalness: 0.10,
  });
  const indicatorMat = new THREE.MeshStandardMaterial({
    color: 0xff9900,
    emissive: 0xff8800,
    emissiveIntensity: 0,
  });

  // Sleek low-profile LED projector headlights
  const headL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.04), headMat);
  headL.position.set(0.62, 0.58, -(HALF_L - 0.14));
  bodyPivot.add(headL);
  const headR = headL.clone();
  headR.position.x = -0.62;
  bodyPivot.add(headR);

  // Sleek taillight clusters
  const tailL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.04), tailMat);
  tailL.position.set(0.63, 0.68, HALF_L - 0.14);
  bodyPivot.add(tailL);
  const tailR = tailL.clone();
  tailR.material = tailMat;
  tailR.position.x = -0.63;
  bodyPivot.add(tailR);

  // Turn indicators
  const indL = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.06, 0.04), indicatorMat);
  indL.position.set(0.84, 0.54, -(HALF_L - 0.28));
  bodyPivot.add(indL);
  const indR = indL.clone();
  indR.material = indicatorMat;
  indR.position.x = -0.84;
  bodyPivot.add(indR);

  // Forward Spotlights with smooth road illumination
  const spotL = new THREE.SpotLight(0xfff8ee, 2.8, 65, Math.PI / 4.8, 0.45, 1.2);
  spotL.position.set(0.62, 0.60, -(HALF_L - 0.15));
  const targetL = new THREE.Object3D();
  targetL.position.set(0.62, 0, -(HALF_L + 30));
  bodyPivot.add(spotL);
  bodyPivot.add(targetL);
  spotL.target = targetL;

  const spotR = new THREE.SpotLight(0xfff8ee, 2.8, 65, Math.PI / 4.8, 0.45, 1.2);
  spotR.position.set(-0.62, 0.60, -(HALF_L - 0.15));
  const targetR = new THREE.Object3D();
  targetR.position.set(-0.62, 0, -(HALF_L + 30));
  bodyPivot.add(spotR);
  bodyPivot.add(targetR);
  spotR.target = targetR;

  return { headMat, tailMat, indicatorMat, spotL, spotR };
}

function makeExhaustAndFlames(bodyPivot) {
  const exhaustMat = new THREE.MeshStandardMaterial({
    color: 0x333538,
    metalness: 0.92,
    roughness: 0.15,
  });

  const tipGeo = new THREE.CylinderGeometry(0.048, 0.052, 0.22, 12);
  tipGeo.rotateX(Math.PI / 2);

  const tipL = new THREE.Mesh(tipGeo, exhaustMat);
  tipL.position.set(0.38, 0.26, HALF_L - 0.02);
  bodyPivot.add(tipL);

  const tipR = tipL.clone();
  tipR.position.x = -0.38;
  bodyPivot.add(tipR);

  const flameOuterGeo = new THREE.ConeGeometry(0.08, 0.40, 8);
  flameOuterGeo.rotateX(-Math.PI / 2);
  const flameOuterMat = new THREE.MeshBasicMaterial({
    color: 0xff7711,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
  });

  const flameInnerGeo = new THREE.ConeGeometry(0.042, 0.30, 8);
  flameInnerGeo.rotateX(-Math.PI / 2);
  const flameInnerMat = new THREE.MeshBasicMaterial({
    color: 0x44ddff,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
  });

  function buildFlameMesh() {
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(flameOuterGeo, flameOuterMat));
    grp.add(new THREE.Mesh(flameInnerGeo, flameInnerMat));
    grp.visible = false;
    return grp;
  }

  const flameL = buildFlameMesh();
  flameL.position.set(0.38, 0.26, HALF_L + 0.18);
  bodyPivot.add(flameL);

  const flameR = buildFlameMesh();
  flameR.position.set(-0.38, 0.26, HALF_L + 0.18);
  bodyPivot.add(flameR);

  const backfireLight = new THREE.PointLight(0xff7700, 0, 8);
  backfireLight.position.set(0, 0.30, HALF_L + 0.25);
  bodyPivot.add(backfireLight);

  return { flameL, flameR, backfireLight, flameOuterMat, flameInnerMat };
}

function buildModelSportsCar(template, renderer, preset = CAR_PRESETS[0]) {
  const group = new THREE.Group();
  group.name = 'drive-sports-car';
  const bodyPivot = new THREE.Group();
  bodyPivot.name = 'drive-sports-car-body';
  group.add(bodyPivot);

  const clone = cloneModel(template);
  const envMap = ensureCarEnvMap(renderer);
  const { carRotorMat: rotorMat } = ensureSportsMaterials(envMap);

  const bodyNode = clone.getObjectByName('body');
  const spoilerNode = clone.getObjectByName('spoiler');

  bodyNode.geometry.computeBoundingBox();
  const srcBox = bodyNode.geometry.boundingBox;
  const srcW = srcBox.max.x - srcBox.min.x;
  const srcH = srcBox.max.y - srcBox.min.y;
  const srcL = srcBox.max.z - srcBox.min.z;
  const scaleX = (HALF_W * 2) / srcW;
  const scaleZ = (HALF_L * 2) / srcL;
  const scaleY = (preset?.scaleY || BODY_HEIGHT) / srcH;

  bodyNode.removeFromParent();
  bodyNode.position.set(0, 0.12, 0);
  bodyNode.rotation.set(0, Math.PI, 0);
  bodyNode.scale.set(scaleX, scaleY, scaleZ);

  // Preserve the rich stylized Kenney colormap texture for all details (grille, trim, glass, lights, body)
  const originalMap = (bodyNode.material && bodyNode.material.map) || carColormapTexture;
  if (originalMap) originalMap.colorSpace = THREE.SRGBColorSpace;

  const bodyMat = new THREE.MeshPhysicalMaterial({
    map: originalMap,
    roughness: 0.28,
    metalness: 0.18,
    clearcoat: 0.88,
    clearcoatRoughness: 0.08,
    envMap: envMap,
    envMapIntensity: 1.25,
  });
  bodyNode.material = bodyMat;
  bodyPivot.add(bodyNode);

  // Active Spoiler (if model has one, like sedan-sports)
  let spoilerPivot = null;
  if (spoilerNode && preset.hasSpoiler) {
    spoilerPivot = new THREE.Group();
    spoilerPivot.name = 'drive-active-spoiler';
    spoilerNode.removeFromParent();

    spoilerPivot.position.set(0, 0.12 + 0.45 * scaleY, (1.04 + 0.025) * scaleZ);
    spoilerNode.position.set(0, 0, 0);
    spoilerNode.rotation.set(0, Math.PI, 0);
    spoilerNode.scale.set(scaleX, scaleY, scaleZ);

    const spoilerMap = (spoilerNode.material && spoilerNode.material.map) || carColormapTexture;
    if (spoilerMap) spoilerMap.colorSpace = THREE.SRGBColorSpace;
    spoilerNode.material = new THREE.MeshPhysicalMaterial({
      map: spoilerMap,
      roughness: 0.22,
      metalness: 0.25,
      clearcoat: 0.90,
      clearcoatRoughness: 0.06,
      envMap: envMap,
      envMapIntensity: 1.2,
    });

    spoilerPivot.add(spoilerNode);
    bodyPivot.add(spoilerPivot);
  }

  // Soft contact shadow under the chassis
  const contactShadow = makeContactShadow();
  group.add(contactShadow);

  const lamps = makeLamps(bodyPivot);
  const exhaust = makeExhaustAndFlames(bodyPivot);

  const wheelNodeNames = {
    wFL: 'wheel-front-left',
    wFR: 'wheel-front-right',
    wRL: 'wheel-back-left',
    wRR: 'wheel-back-right',
  };

  const wheels = makeWheelPivots(
    group,
    (key) => {
      const src = clone.getObjectByName(wheelNodeNames[key]);
      if (src) {
        src.removeFromParent();
        src.position.set(0, 0, 0);
        src.rotation.set(0, 0, 0);
        src.geometry.computeBoundingBox();
        const wb = src.geometry.boundingBox;
        const srcRadius = (wb.max.y - wb.min.y) / 2;
        src.scale.setScalar(WHEEL_RADIUS / srcRadius);
        const wheelMap = (src.material && src.material.map) || carColormapTexture;
        if (wheelMap) wheelMap.colorSpace = THREE.SRGBColorSpace;
        src.material = new THREE.MeshStandardMaterial({
          map: wheelMap,
          roughness: 0.42,
          metalness: 0.35,
          envMap: envMap,
          envMapIntensity: 0.85,
        });
        return src;
      }
      const fallbackGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.24, 16);
      fallbackGeo.rotateZ(Math.PI / 2);
      return new THREE.Mesh(fallbackGeo, new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.85 }));
    },
    envMap,
    rotorMat,
  );

  return {
    group,
    bodyPivot,
    spoilerPivot,
    wheels,
    bodyMat,
    rotorMat,
    ...lamps,
    ...exhaust,
    usingModel: true,
  };
}

function buildProceduralSportsCar(renderer) {
  const group = new THREE.Group();
  group.name = 'drive-sports-car';
  const bodyPivot = new THREE.Group();
  bodyPivot.name = 'drive-sports-car-body';
  group.add(bodyPivot);

  const envMap = ensureCarEnvMap(renderer);
  const { carRotorMat: rotorMat } = ensureSportsMaterials(envMap);

  const { body, paint } = buildCoupeBody(envMap);
  bodyPivot.add(body);
  const spoilerPivot = null;

  const lamps = makeLamps(bodyPivot);
  const exhaust = makeExhaustAndFlames(bodyPivot);

  const wheelTemplate = buildCoupeWheel(envMap);
  const wheels = makeWheelPivots(
    group,
    () => wheelTemplate.clone(true),
    envMap,
    rotorMat,
  );

  group.add(makeContactShadow());

  return {
    group,
    bodyPivot,
    spoilerPivot,
    wheels,
    bodyMat: paint,
    rotorMat,
    ...lamps,
    ...exhaust,
    usingModel: false,
  };
}

function buildCarMesh(renderer, presetIndex = currentCarPresetIndex) {
  const preset = CAR_PRESETS[presetIndex] || CAR_PRESETS[0];
  if (preset.id === 'sedan-sports') {
    try {
      return buildProceduralSportsCar(renderer);
    } catch (err) {
      console.warn('[drive.js] Sculpted coupe unavailable, using the loaded model:', err);
    }
  }
  const template = carTemplates.get(preset.id);
  if (template) {
    try {
      return buildModelSportsCar(template, renderer, preset);
    } catch (e) {
      console.warn(`[drive.js] buildModelSportsCar failed for ${preset.id}:`, e);
    }
  }
  for (const [id, tmpl] of carTemplates.entries()) {
    if (tmpl) {
      try {
        const p = CAR_PRESETS.find((x) => x.id === id) || preset;
        return buildModelSportsCar(tmpl, renderer, p);
      } catch (_) {}
    }
  }
  return buildProceduralSportsCar(renderer);
}

function forwardOf(yaw) {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}
function rightOf(yaw) {
  const f = forwardOf(yaw);
  return { x: -f.z, z: f.x };
}

// ---------------------------------------------------------------------------
// Synthesized WebAudio Sports Engine Acoustics
// ---------------------------------------------------------------------------
let audio = null;
let muted = false;

function whiteNoiseBuffer(ctx, seconds) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function ensureAudio() {
  if (audio) {
    if (audio.ctx.state !== 'running') audio.ctx.resume();
    return audio;
  }
  const shared = ensureAudioContext();
  if (!shared) return null;
  const { ctx, master, analyser } = shared;

  const osc1 = ctx.createOscillator();
  osc1.type = 'sawtooth';

  const osc2 = ctx.createOscillator();
  osc2.type = 'square';
  const osc2Gain = ctx.createGain();
  osc2Gain.gain.value = 0.40;

  const osc3 = ctx.createOscillator();
  osc3.type = 'triangle';
  const osc3Gain = ctx.createGain();
  osc3Gain.gain.value = 0.30;

  const osc4 = ctx.createOscillator();
  osc4.type = 'sawtooth';
  const osc4Gain = ctx.createGain();
  osc4Gain.gain.value = 0.22;

  const engineFilter = ctx.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = 450;
  engineFilter.Q.value = 1.8;

  const engineGain = ctx.createGain();
  engineGain.gain.value = 0;

  osc1.connect(engineFilter);
  osc2.connect(osc2Gain);
  osc2Gain.connect(engineFilter);
  osc3.connect(osc3Gain);
  osc3Gain.connect(engineFilter);
  osc4.connect(osc4Gain);
  osc4Gain.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(master);

  osc1.start();
  osc2.start();
  osc3.start();
  osc4.start();

  const noiseBuf = whiteNoiseBuffer(ctx, 2);
  const engineNoise = ctx.createBufferSource();
  engineNoise.buffer = noiseBuf;
  engineNoise.loop = true;
  const engineNoiseFilter = ctx.createBiquadFilter();
  engineNoiseFilter.type = 'bandpass';
  engineNoiseFilter.frequency.value = 850;
  engineNoiseFilter.Q.value = 1.2;
  const engineNoiseGain = ctx.createGain();
  engineNoiseGain.gain.value = 0;

  engineNoise.connect(engineNoiseFilter);
  engineNoiseFilter.connect(engineNoiseGain);
  engineNoiseGain.connect(master);
  engineNoise.start();

  const popOsc = ctx.createOscillator();
  popOsc.type = 'triangle';
  popOsc.frequency.value = 90;
  const popGain = ctx.createGain();
  popGain.gain.value = 0;
  popOsc.connect(popGain);
  popGain.connect(master);
  popOsc.start();

  const skidSource = ctx.createBufferSource();
  skidSource.buffer = noiseBuf;
  skidSource.loop = true;
  const skidFilter = ctx.createBiquadFilter();
  skidFilter.type = 'bandpass';
  skidFilter.frequency.value = 1850;
  skidFilter.Q.value = 2.8;
  const skidGain = ctx.createGain();
  skidGain.gain.value = 0;

  skidSource.connect(skidFilter);
  skidFilter.connect(skidGain);
  skidGain.connect(master);
  skidSource.start();

  const hornOsc1 = ctx.createOscillator();
  hornOsc1.type = 'sawtooth';
  hornOsc1.frequency.value = 420;
  const hornOsc2 = ctx.createOscillator();
  hornOsc2.type = 'sawtooth';
  hornOsc2.frequency.value = 525;
  const hornGain = ctx.createGain();
  hornGain.gain.value = 0;
  hornOsc1.connect(hornGain);
  hornOsc2.connect(hornGain);
  hornGain.connect(master);
  hornOsc1.start();
  hornOsc2.start();

  const thunkOsc = ctx.createOscillator();
  thunkOsc.type = 'sine';
  thunkOsc.frequency.value = 80;
  const thunkGain = ctx.createGain();
  thunkGain.gain.value = 0;
  thunkOsc.connect(thunkGain);
  thunkGain.connect(master);
  thunkOsc.start();

  audio = {
    ctx,
    master,
    analyser,
    osc1,
    osc2,
    osc3,
    osc4,
    engineFilter,
    engineGain,
    engineNoiseFilter,
    engineNoiseGain,
    popOsc,
    popGain,
    skidFilter,
    skidGain,
    hornGain,
    thunkGain,
  };
  return audio;
}

function playBackfirePop(intensity = 1.0) {
  if (!audio) return;
  const { ctx, popGain, popOsc } = audio;
  const t = ctx.currentTime;
  popOsc.frequency.setValueAtTime(140 * intensity, t);
  popOsc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  popGain.gain.cancelScheduledValues(t);
  popGain.gain.setValueAtTime(Math.min(0.60, 0.40 * intensity), t);
  popGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
}

function playThunk(severity = 1) {
  if (!audio) return;
  const { ctx, thunkGain } = audio;
  const t = ctx.currentTime;
  const gain = Math.max(0.02, 0.55 * THREE.MathUtils.clamp(severity, 0, 1));
  thunkGain.gain.cancelScheduledValues(t);
  thunkGain.gain.setValueAtTime(gain, t);
  thunkGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
}

function playHorn(on) {
  if (!audio) return;
  const { ctx, hornGain } = audio;
  const t = ctx.currentTime;
  hornGain.gain.cancelScheduledValues(t);
  hornGain.gain.setTargetAtTime(on ? 0.25 : 0, t, 0.02);
}

function setMuted(next) {
  muted = next;
  // One master for the whole game (audio.js), so N and the Settings volume agree.
  setSharedMuted(muted);
}

function stopCarAudio() {
  if (!audio) return;
  const t = audio.ctx.currentTime;
  audio.engineGain.gain.cancelScheduledValues(t);
  audio.engineGain.gain.setTargetAtTime(0, t, 0.04);
  audio.engineNoiseGain.gain.cancelScheduledValues(t);
  audio.engineNoiseGain.gain.setTargetAtTime(0, t, 0.04);
  audio.skidGain.gain.cancelScheduledValues(t);
  audio.skidGain.gain.setTargetAtTime(0, t, 0.03);
  audio.hornGain.gain.cancelScheduledValues(t);
  audio.hornGain.gain.setTargetAtTime(0, t, 0.02);
  audio.popGain.gain.cancelScheduledValues(t);
  audio.popGain.gain.setTargetAtTime(0, t, 0.02);
}

function stepAudio(car, throttle, slipAmount) {
  if (!audio) return;
  const t = audio.ctx.currentTime;
  const rpm = car.rpm;
  const baseFreq = 38 + (rpm / 60) * 1.55;

  audio.osc1.frequency.setTargetAtTime(baseFreq, t, 0.04);
  audio.osc2.frequency.setTargetAtTime(baseFreq * 2.0, t, 0.04);
  audio.osc3.frequency.setTargetAtTime(baseFreq * 3.01, t, 0.04);
  audio.osc4.frequency.setTargetAtTime(baseFreq * 4.02, t, 0.04);

  const throttleBonus = throttle ? 1400 : 200;
  const cutoff = 380 + (rpm / REDLINE_RPM) * 3200 + throttleBonus;
  audio.engineFilter.frequency.setTargetAtTime(Math.min(8000, cutoff), t, 0.05);

  const gain = 0.12 + (rpm / REDLINE_RPM) * 0.16 + (throttle ? 0.06 : 0);
  audio.engineGain.gain.setTargetAtTime(gain, t, 0.05);

  const noiseGain = 0.02 + (rpm / REDLINE_RPM) * 0.025 + (throttle ? 0.01 : 0);
  audio.engineNoiseGain.gain.setTargetAtTime(noiseGain, t, 0.05);

  const screeching = slipAmount > 0.18 && Math.abs(car.speed) > 3.0;
  audio.skidFilter.frequency.setTargetAtTime(1400 + THREE.MathUtils.clamp(slipAmount, 0, 1) * 1200, t, 0.05);
  audio.skidGain.gain.setTargetAtTime(screeching ? Math.min(0.35, slipAmount * 0.45) : 0, t, 0.04);
}

function readAnalyserRMS() {
  if (!audio) return null;
  const arr = new Uint8Array(audio.analyser.fftSize);
  audio.analyser.getByteTimeDomainData(arr);
  let sumSq = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = (arr[i] - 128) / 128;
    sumSq += v * v;
  }
  return Math.sqrt(sumSq / arr.length);
}

// ---------------------------------------------------------------------------
// Dual Skidmark Trails & Volumetric Smoke Particles
// ---------------------------------------------------------------------------
function buildSkidPool(scene) {
  const geo = new THREE.PlaneGeometry(0.24, 0.70);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x111111,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, SKID_CAP);
  mesh.name = 'drive-skid-pool';
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const hideMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < SKID_CAP; i++) mesh.setMatrixAt(i, hideMatrix);
  scene.add(mesh);
  return { mesh, next: 0, lastX: null, lastZ: null };
}

function layDownSkid(pool, x, z, yaw) {
  const m = new THREE.Matrix4();
  m.compose(
    new THREE.Vector3(x, 0.015, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
    new THREE.Vector3(1, 1, 1),
  );
  pool.mesh.setMatrixAt(pool.next, m);
  pool.mesh.count = Math.max(pool.mesh.count, pool.next + 1);
  pool.mesh.instanceMatrix.needsUpdate = true;
  pool.next = (pool.next + 1) % SKID_CAP;
}

function buildSmokePool(scene) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(220, 220, 220, 0.85)');
  grad.addColorStop(0.5, 'rgba(200, 200, 200, 0.35)');
  grad.addColorStop(1, 'rgba(200, 200, 200, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false });

  const sprites = [];
  for (let i = 0; i < SMOKE_CAP; i++) {
    const s = new THREE.Sprite(mat.clone());
    s.visible = false;
    s.scale.set(0.2, 0.2, 0.2);
    scene.add(s);
    sprites.push({ sprite: s, age: 999, maxAge: 0.8, vx: 0, vy: 0, vz: 0 });
  }

  let nextIdx = 0;
  function spawn(x, y, z, vx, vz) {
    const p = sprites[nextIdx];
    nextIdx = (nextIdx + 1) % SMOKE_CAP;
    p.sprite.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3);
    p.sprite.visible = true;
    p.sprite.material.opacity = 0.65;
    p.sprite.scale.set(0.25, 0.25, 0.25);
    p.age = 0;
    p.maxAge = 0.6 + Math.random() * 0.4;
    p.vx = vx * 0.2 + (Math.random() - 0.5) * 0.8;
    p.vy = 0.8 + Math.random() * 0.6;
    p.vz = vz * 0.2 + (Math.random() - 0.5) * 0.8;
  }

  function update(dt) {
    for (const p of sprites) {
      if (p.age < p.maxAge) {
        p.age += dt;
        const progress = p.age / p.maxAge;
        p.sprite.position.x += p.vx * dt;
        p.sprite.position.y += p.vy * dt;
        p.sprite.position.z += p.vz * dt;
        const s = 0.3 + progress * 2.2;
        p.sprite.scale.set(s, s, s);
        p.sprite.material.opacity = 0.65 * (1 - progress);
        if (progress >= 1) p.sprite.visible = false;
      }
    }
  }

  return { spawn, update };
}

// ---------------------------------------------------------------------------
// Driving Controller & Cockpit HUD
// ---------------------------------------------------------------------------
function initDrive(mirpur) {
  const { player, scene, camera, collision, boundary, renderer, walkable } = mirpur;

  if (renderer && renderer.toneMapping === THREE.NoToneMapping) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
  }

  const hud = document.getElementById('hud');
  const modeEl = document.getElementById('mode');
  const btn = document.getElementById('drive-btn');
  const bottombar = document.getElementById('bottombar');

  // --- Sports Car Cockpit HUD Canvas & Drift Banner -----------------------
  let sportsHudWrap = null;
  let hudCanvas = null;
  let hudCtx = null;
  let driftBanner = null;
  let cameraToast = null;
  let cameraToastTimer = 0;

  function createSportsHud() {
    if (sportsHudWrap) return;

    // Positioned on the right side, neatly stacked above the 190px circular minimap
    sportsHudWrap = document.createElement('div');
    sportsHudWrap.id = 'sports-hud-wrap';
    sportsHudWrap.style.cssText = `
      position: fixed;
      bottom: 228px;
      right: 16px;
      width: 190px;
      height: 190px;
      z-index: 22;
      pointer-events: none;
      display: none;
      filter: drop-shadow(0 4px 16px rgba(0,0,0,0.6));
    `;

    hudCanvas = document.createElement('canvas');
    hudCanvas.width = 380; // Retina 2x
    hudCanvas.height = 380;
    hudCanvas.style.cssText = 'width: 100%; height: 100%; display: block;';
    hudCtx = hudCanvas.getContext('2d');
    sportsHudWrap.appendChild(hudCanvas);
    document.body.appendChild(sportsHudWrap);

    // Dynamic Drift Banner
    driftBanner = document.createElement('div');
    driftBanner.id = 'drift-banner';
    driftBanner.style.cssText = `
      position: fixed;
      top: 20%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #ffaa00;
      font-family: system-ui, -apple-system, sans-serif;
      font-weight: 800;
      font-size: 26px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      text-shadow: 0 0 16px rgba(255, 170, 0, 0.8), 0 2px 8px rgba(0,0,0,0.8);
      z-index: 23;
      pointer-events: none;
      display: none;
      text-align: center;
    `;
    document.body.appendChild(driftBanner);

    // GTA Camera Notification Toast
    cameraToast = document.createElement('div');
    cameraToast.id = 'gta-camera-toast';
    cameraToast.style.cssText = `
      position: fixed;
      top: 14%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(14, 16, 20, 0.88);
      border: 1px solid rgba(0, 220, 255, 0.5);
      border-radius: 8px;
      padding: 6px 16px;
      color: #00ffd5;
      font-family: system-ui, -apple-system, sans-serif;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.7);
      z-index: 24;
      pointer-events: none;
      display: none;
      transition: opacity 0.25s ease;
    `;
    document.body.appendChild(cameraToast);
  }

  function showCameraToast(name) {
    if (!cameraToast) return;
    cameraToast.innerHTML = name;
    cameraToast.style.display = 'block';
    cameraToast.style.opacity = '1';
    cameraToastTimer = 2.0;
  }

  createSportsHud();

  let speedEl = null;
  let muteBtn = null;
  if (bottombar) {
    const sep1 = document.createElement('span');
    sep1.className = 'sep';
    sep1.textContent = '|';
    const speedWrap = document.createElement('span');
    speedWrap.id = 'drive-speed-wrap';
    speedWrap.style.display = 'none';
    const speedB = document.createElement('b');
    speedB.id = 'drive-speed';
    speedB.textContent = '0';
    speedWrap.append('Speed ', speedB, ' km/h');
    bottombar.append(sep1, speedWrap);
    speedEl = speedB;

    const sep2 = document.createElement('span');
    sep2.className = 'sep';
    sep2.textContent = '|';
    muteBtn = document.createElement('button');
    muteBtn.id = 'drive-mute';
    muteBtn.type = 'button';
    muteBtn.textContent = 'Sound on (N)';
    muteBtn.style.cssText =
      'font: inherit; color: inherit; background: none; border: none; cursor: pointer; padding: 0; text-decoration: underline dotted;';
    muteBtn.addEventListener('click', () => {
      setMuted(!muted);
      muteBtn.textContent = muted ? 'Sound off (N)' : 'Sound on (N)';
    });
    bottombar.append(sep2, muteBtn);
    // Language switch (Settings): relabel the button for the current state.
    window.addEventListener('mirpur:lang', () => {
      btn.textContent = tr(driving ? 'Exit car (V)' : 'Drive (V)');
    });
    window.addEventListener('mirpur:mute', (e) => {
      muted = e.detail;
      muteBtn.textContent = muted ? 'Sound off (N)' : 'Sound on (N)';
    });
  }

  let driving = false;
  let carMesh = null;
  let car = null;
  let originalPlayerUpdate = null;
  let originalFov = camera.fov;
  let displayFov = camera.fov;
  let camPos = new THREE.Vector3();
  let camInit = false;
  let camChaseYaw = null;
  let cameraViewMode = 0; // 0..4 in GTA_CAMERA_MODES
  let mouseOrbitYaw = 0;
  let mouseOrbitPitch = 0;
  let mouseActiveTimer = 0;
  let prevSpeed = 0;
  let pitchAngle = 0;
  let rollAngle = 0;
  let shakeImpulse = 0;
  let indicatorPhase = 0;
  const keys = new Set();

  const skidPool = buildSkidPool(scene);
  const smokePool = buildSmokePool(scene);

  function keyName(e) {
    if (e.code) return e.code;
    const k = e.key;
    if (!k) return '';
    if (k.length === 1) {
      const u = k.toUpperCase();
      if (u >= 'A' && u <= 'Z') return `Key${u}`;
    }
    return k;
  }

  function switchCarPreset(newIndex) {
    if (!driving || !car || !carMesh) return;
    currentCarPresetIndex = newIndex;
    const preset = CAR_PRESETS[currentCarPresetIndex];

    const prevPos = carMesh.group.position.clone();
    const prevYaw = carMesh.group.rotation.y;

    releaseCarMesh(carMesh);

    carMesh = acquireCarMesh(currentCarPresetIndex);
    carMesh.group.position.copy(prevPos);
    carMesh.group.rotation.y = prevYaw;
    scene.add(carMesh.group);

    showCameraToast(`VEHICLE: ${preset.name.toUpperCase()}`);
  }

  // Prevent browser context menu while driving so Right Click drag acts as freelook
  window.addEventListener('contextmenu', (e) => {
    if (driving) e.preventDefault();
  });

  // Mouse orbit look around car (freelook when holding Right Mouse Button)
  window.addEventListener('mousemove', (e) => {
    if (!driving || player.switching || isGameplayBlocked()) return;
    // Only orbit camera if Right Mouse button is held down
    if ((e.buttons & 2) !== 0) {
      mouseOrbitYaw -= e.movementX * 0.0035;
      mouseOrbitPitch = THREE.MathUtils.clamp(mouseOrbitPitch - e.movementY * 0.0025, -0.32, 0.40);
      mouseActiveTimer = 0.35; // brief snap-back timer once released
    }
  });

  window.addEventListener('keydown', (e) => {
    const code = keyName(e);
    if (e.metaKey || e.ctrlKey || e.altKey || isEditableTarget(e.target) || player.switching || isGameplayBlocked()) return;
    keys.add(code);
    if (e.repeat) return;

    if (code === 'KeyV') {
      toggleDrive();
    } else if (code === 'KeyN') {
      setMuted(!muted);
      if (muteBtn) muteBtn.textContent = muted ? 'Sound off (N)' : 'Sound on (N)';
    } else if (code === 'KeyK' && driving) {
      playHorn(true);
    } else if (code === 'KeyX' && driving) {
      currentCarPresetIndex = (currentCarPresetIndex + 1) % CAR_PRESETS.length;
      switchCarPreset(currentCarPresetIndex);
    } else if (code === 'KeyC' && driving) {
      // Cycle through all 5 GTA Camera Modes
      camChaseYaw = null;
      cameraViewMode = (cameraViewMode + 1) % GTA_CAMERA_MODES.length;
      camInit = false;
      showCameraToast(`CAMERA: ${GTA_CAMERA_MODES[cameraViewMode].name}`);
    }
  });

  window.addEventListener('keyup', (e) => {
    const code = keyName(e);
    keys.delete(code);
    if (code === 'KeyK') playHorn(false);
  });

  btn.addEventListener('click', () => toggleDrive());

  // Built cars are kept per preset and only detached from the scene on exit.
  // Disposing and rebuilding them on every V press forced their materials to
  // recompile each time (~1.2 s hitch per entry).
  const carMeshCache = new Map();

  function acquireCarMesh(presetIndex) {
    const cached = carMeshCache.get(presetIndex);
    if (cached) {
      if (cached.flameL) cached.flameL.visible = false;
      if (cached.flameR) cached.flameR.visible = false;
      if (cached.backfireLight) cached.backfireLight.intensity = 0;
      return cached;
    }
    const preset = CAR_PRESETS[presetIndex] || CAR_PRESETS[0];
    const mesh = buildCarMesh(renderer, presetIndex);
    // buildCarMesh substitutes another model while this preset's GLB is still
    // downloading; don't pin that stand-in to this preset.
    if (preset.id === 'sedan-sports' || carTemplates.has(preset.id)) carMeshCache.set(presetIndex, mesh);
    return mesh;
  }

  function releaseCarMesh(mesh) {
    scene.remove(mesh.group);
    for (const cached of carMeshCache.values()) if (cached === mesh) return;
    mesh.group.traverse((o) => {
      if (!mesh.usingModel && o.geometry && !o.isInstancedMesh) o.geometry.dispose?.();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const isLamp = mats.includes(mesh.headMat) || mats.includes(mesh.tailMat) || mats.includes(mesh.indicatorMat);
        if (!mesh.usingModel || isLamp) mats.forEach((m) => m.dispose?.());
      }
    });
  }

  // The car carries two spot lights and a point light. A change in light
  // count makes three.js recompile every material in the world, which froze
  // the first V press for seconds. Compile that variant ahead of time, in the
  // background, with the car parked out of sight for the synchronous part only.
  function prewarmDriving() {
    if (typeof renderer.compileAsync !== 'function') return;
    try {
      const mesh = acquireCarMesh(currentCarPresetIndex);
      mesh.group.position.set(0, -1000, 0);
      scene.add(mesh.group);
      const t0 = performance.now();
      const done = renderer.compileAsync(scene, camera);
      scene.remove(mesh.group);
      done
        .then(() => console.info(`[drive] driving shaders pre-compiled in ${Math.round(performance.now() - t0)} ms`))
        .catch((err) => console.warn('[drive] shader pre-compile skipped:', err));
    } catch (err) {
      console.warn('[drive] shader pre-compile skipped:', err);
    }
  }
  prewarmDriving();

  // The other presets compile their own materials the first time X selects
  // them. Build and compile each one in idle time once its GLB has arrived;
  // compiling the car group against `scene` picks up the world's lights.
  function prewarmPreset(index, attempt = 0) {
    if (carMeshCache.has(index)) return;
    if (!carTemplates.has(CAR_PRESETS[index].id)) {
      if (attempt < 40) setTimeout(() => prewarmPreset(index, attempt + 1), 500);
      return;
    }
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
    idle(() => {
      if (carMeshCache.has(index)) return;
      try {
        const mesh = acquireCarMesh(index);
        renderer.compileAsync?.(mesh.group, camera, scene)?.catch(() => {});
      } catch (err) {
        console.warn(`[drive] preset ${CAR_PRESETS[index].id} pre-build skipped:`, err);
      }
    });
  }
  CAR_PRESETS.forEach((_, i) => {
    if (i !== currentCarPresetIndex) setTimeout(() => prewarmPreset(i), 800 + i * 400);
  });

  function toggleDrive() {
    if (hud.classList.contains('hidden') || player.switching || player.inLift || player.inRide || player.ridingTrain || (!driving && player.feetY > 1) || isGameplayBlocked()) return;
    ensureAudio();
    if (!driving) enterCar();
    else exitCar();
  }

  function enterCar() {
    const fwd = forwardOf(player.yaw);
    const x = player.position.x + fwd.x * 3.5;
    const z = player.position.z + fwd.z * 3.5;

    car = {
      x,
      z,
      yaw: player.yaw,
      speed: 0, // Longitudinal speed (m/s)
      lateralVel: 0, // Drift lateral slip (m/s)
      yawRate: 0, // Current angular turning speed
      crashYawRate: 0,
      steer: 0,
      rpm: IDLE_RPM,
      brakeHeat: 0,
      backfireTimer: 0,
      isDrifting: false,
      driftAngleDeg: 0,
      driftScore: 0,
      driftCombo: 1.0,
      driftDisplayTimer: 0,
      lastThrottle: false,
    };

    carMesh = acquireCarMesh(currentCarPresetIndex);
    carMesh.group.position.set(x, 0, z);
    carMesh.group.rotation.y = car.yaw;
    scene.add(carMesh.group);
    playThunk();

    if (!originalPlayerUpdate) originalPlayerUpdate = player.update.bind(player);
    player.update = () => {};

    camInit = false;
    camChaseYaw = null;
    mouseOrbitYaw = 0;
    mouseOrbitPitch = 0;
    mouseActiveTimer = 0;
    prevSpeed = 0;
    pitchAngle = 0;
    rollAngle = 0;
    driving = true;
    player.keys.clear();
    window.dispatchEvent(new CustomEvent('mirpur:drivingchange', { detail: { driving } }));
    btn.classList.add('active');
    btn.textContent = tr('Exit car (V)');
    if (modeEl) modeEl.textContent = tr('Drive');
    if (speedEl && speedEl.parentElement) speedEl.parentElement.style.display = '';
    if (sportsHudWrap) sportsHudWrap.style.display = 'block';

    const preset = CAR_PRESETS[currentCarPresetIndex];
    showCameraToast(`VEHICLE: ${preset.name.toUpperCase()} (X: Switch Car)`);
  }

  function exitCar() {
    if (!car || !carMesh) return;
    const right = rightOf(car.yaw);
    let exitX = car.x + right.x * (HALF_W + 1.1);
    let exitZ = car.z + right.z * (HALF_W + 1.1);
    if (collision) {
      const [safeX, safeZ] = resolveCollision(collision, exitX, exitZ, 0.42, 1.2);
      exitX = safeX;
      exitZ = safeZ;
    }
    const groundY = walkable ? (walkable.supportHeightAt(exitX, exitZ, 0) ?? 0) : 0;
    player.teleport(exitX, exitZ, groundY + 1.68, car.yaw);
    if (camera) {
      camera.position.set(exitX, groundY + 1.68, exitZ);
    }
    stopCarAudio();
    playThunk();
    keys.clear();

    releaseCarMesh(carMesh);

    if (originalPlayerUpdate) player.update = originalPlayerUpdate;
    camera.fov = originalFov;
    camera.updateProjectionMatrix();

    driving = false;
    player.keys.clear();
    window.dispatchEvent(new CustomEvent('mirpur:drivingchange', { detail: { driving } }));
    car = null;
    carMesh = null;
    btn.classList.remove('active');
    btn.textContent = tr('Drive (V)');
    if (modeEl) modeEl.textContent = tr(player.flying ? 'Fly' : 'Walk');
    if (speedEl && speedEl.parentElement) speedEl.parentElement.style.display = 'none';
    if (sportsHudWrap) sportsHudWrap.style.display = 'none';
    if (driftBanner) driftBanner.style.display = 'none';
    if (cameraToast) cameraToast.style.display = 'none';
  }

  // -------------------------------------------------------------------------
  // GTA-Style Responsive Sports Handling Physics & Drifting
  // -------------------------------------------------------------------------
  function stepCar(dt) {
    const throttleKey = keys.has('KeyW') || keys.has('ArrowUp') || touchInput.keys.has('KeyW');
    const brakeKey = keys.has('KeyS') || keys.has('ArrowDown') || touchInput.keys.has('KeyS');
    const leftKey = keys.has('KeyA') || keys.has('ArrowLeft');
    const rightKey = keys.has('KeyD') || keys.has('ArrowRight');
    const handbrake = keys.has('Space') || touchInput.keys.has('Space');

    if (car.backfireTimer > 0) car.backfireTimer -= dt;

    // Backfire crackle on throttle lift-off at speed
    if (car.lastThrottle && !throttleKey && Math.abs(car.speed) > 15.0) {
      playBackfirePop(1.1);
      car.backfireTimer = 0.12;
    }
    car.lastThrottle = throttleKey;

    const speedAbs = Math.abs(car.speed);
    const speedFrac = THREE.MathUtils.clamp(speedAbs / MAX_SPEED_FORWARD, 0, 1);

    // 1. Longitudinal Acceleration & Braking (Instant, punchy, intuitive)
    if (throttleKey) {
      if (car.speed < -0.5) {
        // Braking while in reverse
        car.speed = Math.min(0, car.speed + BRAKE_DECEL * dt);
      } else {
        // Forward acceleration (fast low-end, tapering towards top speed)
        const accelFactor = Math.max(0.20, 1.0 - Math.pow(speedFrac, 1.4));
        car.speed += ACCEL_FORWARD * accelFactor * dt;
        car.speed = Math.min(MAX_SPEED_FORWARD, car.speed);
      }
    } else if (brakeKey) {
      if (car.speed > 0.3) {
        // High-power straight-line sports braking
        car.speed = Math.max(0, car.speed - BRAKE_DECEL * dt);
        car.brakeHeat = Math.min(1.0, car.brakeHeat + 0.70 * dt);
      } else {
        // Smooth reverse gear
        car.speed = Math.max(-MAX_SPEED_REVERSE, car.speed - REVERSE_ACCEL * dt);
      }
    } else {
      // Natural coasting drag
      const dragStep = COAST_DRAG * dt;
      if (car.speed > 0) car.speed = Math.max(0, car.speed - dragStep);
      else if (car.speed < 0) car.speed = Math.min(0, car.speed + dragStep);
      car.brakeHeat = Math.max(0, car.brakeHeat - 0.18 * dt);
    }

    if (handbrake && speedAbs > 0.5) {
      // Handbrake slows down car while facilitating drift
      const hbStep = 8.5 * dt;
      if (car.speed > 0) car.speed = Math.max(0, car.speed - hbStep);
      else if (car.speed < 0) car.speed = Math.min(0, car.speed + hbStep);
      car.brakeHeat = Math.min(1.0, car.brakeHeat + 0.85 * dt);
    }

    // 2. Speed-Sensitive Smooth Sports Steering (Keyboard-friendly, stable at speed)
    let steerInput = 0;
    if (leftKey) steerInput += 1;
    if (rightKey) steerInput -= 1;
    steerInput = THREE.MathUtils.clamp(steerInput - touchInput.strafe, -1, 1);

    // Smooth speed-sensitive steering angle:
    // Generous steering lock (0.48 rad ~27.5°) at low speed for tight city corners,
    // smoothly scaling down non-linearly to 0.09 rad (~5.1°) at highway speeds for rock-solid stability
    const speedRatio = Math.min(1, speedAbs / 28.0);
    const steerFactor = Math.pow(1 - speedRatio, 1.5);
    const maxSteerNow = MAX_STEER_HIGH_SPEED + (MAX_STEER_LOW_SPEED - MAX_STEER_HIGH_SPEED) * steerFactor;
    const targetSteer = steerInput * maxSteerNow;

    // Gradual keyboard steering: smooth turn-in, rapid centering
    const steerRate = (steerInput !== 0) ? STEER_IN_LERP : STEER_RETURN_LERP;
    car.steer += (targetSteer - car.steer) * (1 - Math.exp(-steerRate * dt));

    // 3. Crisp, Grounded Turning Physics
    // Turning authority is tied to actual rolling speed with a smooth pull-away curve from a stop
    let effectiveTurnSpeed = car.speed;
    if (speedAbs < 2.0 && (throttleKey || brakeKey) && steerInput !== 0) {
      // Gentle start assist from stationary so the car can turn out of a tight parking spot
      const dir = car.speed !== 0 ? Math.sign(car.speed) : (throttleKey ? 1 : -1);
      const minRoll = Math.min(speedAbs + 1.2, 2.4);
      effectiveTurnSpeed = dir * Math.max(speedAbs, minRoll);
    }

    const kinematicTurnRate = (effectiveTurnSpeed / WHEELBASE) * Math.tan(car.steer);

    if (handbrake && speedAbs > 4.0) {
      // --- HANDBRAKE DRIFT MODE ---
      // Rear breaks loose with high-angle oversteer kick
      const driftDir = Math.sign(car.steer) || (car.yawRate > 0 ? 1 : -1);
      const driftKick = driftDir * 1.6;
      const targetYawRate = kinematicTurnRate + driftKick;
      car.yawRate += (targetYawRate - car.yawRate) * (1 - Math.exp(-14.0 * dt));
      car.yaw += car.yawRate * dt;

      // Controlled lateral slide outward
      const targetSlide = -driftDir * Math.min(7.5, speedAbs * 0.32);
      car.lateralVel += (targetSlide - car.lateralVel) * (1 - Math.exp(-8.0 * dt));
    } else {
      // --- GLUED-IN GRIP MODE ---
      // Angular momentum smoothing: prevents twitchy instant-snap turning while maintaining razor-sharp control
      const yawRateLerp = 1 - Math.exp(-YAW_FOLLOW_RATE * dt);
      car.yawRate += (kinematicTurnRate - car.yawRate) * yawRateLerp;
      car.yaw += (car.yawRate + (car.crashYawRate || 0)) * dt;

      // Smooth grip lateral velocity dampening
      car.lateralVel *= Math.exp(-15.0 * dt);
      if (Math.abs(car.lateralVel) < 0.01) car.lateralVel = 0;
    }

    // Decay crash yaw impulse from wall impacts
    if (car.crashYawRate) {
      car.crashYawRate *= Math.exp(-12.0 * dt);
    }

    // 4. World Position Translation
    const fwd = forwardOf(car.yaw);
    const rgt = rightOf(car.yaw);

    let nx = car.x + (fwd.x * car.speed + rgt.x * car.lateralVel) * dt;
    let nz = car.z + (fwd.z * car.speed + rgt.z * car.lateralVel) * dt;

    // 5. Collision Response with Walls (Pushes out and prevents sticking)
    const corners = [
      [nx + fwd.x * HALF_L + rgt.x * HALF_W, nz + fwd.z * HALF_L + rgt.z * HALF_W],
      [nx + fwd.x * HALF_L - rgt.x * HALF_W, nz + fwd.z * HALF_L - rgt.z * HALF_W],
      [nx - fwd.x * HALF_L + rgt.x * HALF_W, nz - fwd.z * HALF_L + rgt.z * HALF_W],
      [nx - fwd.x * HALF_L - rgt.x * HALF_W, nz - fwd.z * HALF_L - rgt.z * HALF_W],
    ];

    let dxSum = 0;
    let dzSum = 0;
    let hitCount = 0;
    let normSumX = 0;
    let normSumZ = 0;
    let torque = 0;

    for (const [cx, cz] of corners) {
      const [px, pz] = resolveCollision(collision, cx, cz, CORNER_RADIUS, CAR_COLLIDE_Y);
      const pushX = px - cx;
      const pushZ = pz - cz;
      dxSum += pushX;
      dzSum += pushZ;
      if (pushX !== 0 || pushZ !== 0) {
        hitCount++;
        normSumX += pushX;
        normSumZ += pushZ;
        const pushLen = Math.hypot(pushX, pushZ);
        const nHatX = pushX / pushLen;
        const nHatZ = pushZ / pushLen;
        const rx = cx - nx;
        const rz = cz - nz;
        torque += rx * nHatZ - rz * nHatX;
      }
    }

    if (hitCount > 0) {
      nx += dxSum / hitCount;
      nz += dzSum / hitCount;

      const normLen = Math.hypot(normSumX, normSumZ);
      if (normLen > 1e-5) {
        const nrmX = normSumX / normLen;
        const nrmZ = normSumZ / normLen;
        const tanX = -nrmZ;
        const tanZ = nrmX;

        const worldVx = fwd.x * car.speed + rgt.x * car.lateralVel;
        const worldVz = fwd.z * car.speed + rgt.z * car.lateralVel;
        const vn = worldVx * nrmX + worldVz * nrmZ;
        const vt = worldVx * tanX + worldVz * tanZ;

        const vnAfter = vn < 0 ? -vn * CRASH_RESTITUTION : vn;
        const vtAfter = vt * Math.exp(-CRASH_TANGENT_FRICTION * dt);

        const vxAfter = vnAfter * nrmX + vtAfter * tanX;
        const vzAfter = vnAfter * nrmZ + vtAfter * tanZ;

        car.speed = vxAfter * fwd.x + vzAfter * fwd.z;
        car.lateralVel = vxAfter * rgt.x + vzAfter * rgt.z;

        car.crashYawRate = THREE.MathUtils.clamp(
          (car.crashYawRate || 0) + torque * Math.abs(vn) * CRASH_ANGULAR_SCALE,
          -CRASH_YAW_RATE_MAX,
          CRASH_YAW_RATE_MAX,
        );

        const severity = THREE.MathUtils.clamp(Math.abs(vn) / CRASH_SEVERITY_SPEED, 0, 1);
        shakeImpulse = Math.max(shakeImpulse, 0.45 * severity);
        if (severity > 0.03) playThunk(severity);
      }
    }

    // Playable boundary check
    if (boundary) {
      const { dist, nx: cnx, nz: cnz } = boundary.distanceToCorridor(nx, nz);
      player.leavingMirpur = dist > boundary.WARN;
      if (dist > boundary.PUSH) {
        const dx = cnx - nx;
        const dz = cnz - nz;
        const dlen = Math.hypot(dx, dz) || 1;
        const ix = dx / dlen;
        const iz = dz / dlen;
        const t = Math.min(1, (dist - boundary.PUSH) / (boundary.HARD - boundary.PUSH));
        car.speed *= 1 - 0.5 * t;
        const targetYaw = Math.atan2(-ix, -iz);
        let dyaw = targetYaw - car.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        car.yaw += dyaw * Math.min(1, 2.5 * t * dt);
        nx += ix * 6 * t * dt;
        nz += iz * 6 * t * dt;
        if (dist > boundary.HARD) {
          const over = dist - boundary.HARD;
          nx += ix * over;
          nz += iz * over;
        }
      }
    }

    car.x = nx;
    car.z = nz;

    // RPM for tachometer & audio
    let targetRpm = IDLE_RPM + (speedFrac * 6800);
    if (throttleKey) targetRpm += 550;
    car.rpm += (targetRpm - car.rpm) * Math.min(1, 14.0 * dt);
    car.rpm = THREE.MathUtils.clamp(car.rpm, IDLE_RPM, REDLINE_RPM);

    // 6. Drift Scoring
    const slipAngle = Math.abs(car.lateralVel) / Math.max(1.0, speedAbs);
    const slipAngleDeg = Math.round(slipAngle * (180 / Math.PI));
    car.driftAngleDeg = slipAngleDeg;
    const isDrifting = slipAngleDeg > 12 && speedAbs > 7.0;

    if (isDrifting) {
      car.isDrifting = true;
      car.driftDisplayTimer = 1.2;
      car.driftCombo = Math.min(4.0, car.driftCombo + dt * 0.4);
      car.driftScore += Math.round(speedAbs * slipAngleDeg * car.driftCombo * dt * 3.0);
    } else {
      car.isDrifting = false;
      if (car.driftDisplayTimer > 0) {
        car.driftDisplayTimer -= dt;
      } else {
        car.driftCombo = 1.0;
      }
    }

    // 7. Mesh Transforms & Wheel Spin
    carMesh.group.position.set(car.x, 0, car.z);
    carMesh.group.rotation.y = car.yaw;

    const wheelSpinDelta = (car.speed / WHEEL_RADIUS) * dt;
    for (const key of ['wFL', 'wFR', 'wRL', 'wRR']) {
      carMesh.wheels[key].mesh.rotation.x += wheelSpinDelta;
    }
    carMesh.wheels.wFL.pivot.rotation.y = car.steer;
    carMesh.wheels.wFR.pivot.rotation.y = car.steer;

    player.position.set(car.x, 1.2, car.z);
    player.yaw = car.yaw;

    stepFeel(dt, throttleKey, brakeKey, handbrake, car.yawRate, slipAngle);
    stepAudio(car, throttleKey, slipAngle);
    smokePool.update(dt);
  }

  // -------------------------------------------------------------------------
  // Visual Feel, Active Spoiler, Dual Skids & Cockpit HUD
  // -------------------------------------------------------------------------
  function stepFeel(dt, throttle, brakeKey, handbrake, yawRate, slipAmount) {
    const speedAbs = Math.abs(car.speed);
    const speedKmH = Math.round(speedAbs * 3.6);

    // Virtual 4-Wheel Suspension (Squat, Dive & Roll)
    const accel = (car.speed - prevSpeed) / Math.max(dt, 1e-4);
    prevSpeed = car.speed;
    const targetPitch = THREE.MathUtils.clamp(-accel / 15, -0.06, 0.06);
    const targetRoll = THREE.MathUtils.clamp((yawRate * car.speed) / 16, -0.08, 0.08);

    pitchAngle += (targetPitch - pitchAngle) * (1 - Math.exp(-8.0 * dt));
    rollAngle += (targetRoll - rollAngle) * (1 - Math.exp(-8.0 * dt));

    carMesh.bodyPivot.rotation.x = pitchAngle;
    carMesh.bodyPivot.rotation.z = rollAngle;

    // Active Spoiler / Airbrake
    if (carMesh.spoilerPivot) {
      let targetSpoilerPitch = 0;
      if (brakeKey && speedAbs > 12) {
        targetSpoilerPitch = -0.75; // 45° airbrake deployment
      } else if (speedAbs > 24) {
        targetSpoilerPitch = -0.15; // downforce trim
      }
      carMesh.spoilerPivot.rotation.x += (targetSpoilerPitch - carMesh.spoilerPivot.rotation.x) * Math.min(1, 8.0 * dt);
    }

    // Taillights
    const isBraking = (brakeKey && car.speed > 0.1) || handbrake;
    carMesh.tailMat.emissiveIntensity = isBraking ? 1.8 : 0.45;

    // Glowing Brake Rotors
    if (carMesh.rotorMat) {
      carMesh.rotorMat.emissiveIntensity = car.brakeHeat * 2.5;
    }

    // Turn Indicators
    if (Math.abs(car.steer) > MAX_STEER_LOW_SPEED * 0.35) {
      indicatorPhase += dt;
      const on = Math.floor(indicatorPhase / 0.32) % 2 === 0;
      carMesh.indicatorMat.emissiveIntensity = on ? 2.5 : 0;
    } else {
      indicatorPhase = 0;
      carMesh.indicatorMat.emissiveIntensity = 0;
    }

    // Backfire Flame Bursts
    if (car.backfireTimer > 0) {
      carMesh.flameL.visible = true;
      carMesh.flameR.visible = true;
      const flicker = Math.random() * 0.4;
      carMesh.flameL.scale.set(0.9 + flicker, 0.9 + flicker, (0.9 + flicker) * 1.5);
      carMesh.flameR.scale.copy(carMesh.flameL.scale);
      carMesh.backfireLight.intensity = 2.4 + Math.random() * 1.2;
    } else {
      carMesh.flameL.visible = false;
      carMesh.flameR.visible = false;
      carMesh.backfireLight.intensity = 0;
    }

    // Dual Skidmarks & Tire Smoke
    const slipping = (slipAmount > 0.20 && speedAbs > 4.0) || (handbrake && speedAbs > 3.0);
    if (slipping) {
      const rgt = rightOf(car.yaw);
      const fwd = forwardOf(car.yaw);

      const rlx = car.x - fwd.x * (HALF_L - 0.35) + rgt.x * (HALF_W * 0.88);
      const rlz = car.z - fwd.z * (HALF_L - 0.35) + rgt.z * (HALF_W * 0.88);

      const rrx = car.x - fwd.x * (HALF_L - 0.35) - rgt.x * (HALF_W * 0.88);
      const rrz = car.z - fwd.z * (HALF_L - 0.35) - rgt.z * (HALF_W * 0.88);

      if (skidPool.lastX === null || Math.hypot(rlx - skidPool.lastX, rlz - skidPool.lastZ) > SKID_SPACING) {
        layDownSkid(skidPool, rlx, rlz, car.yaw);
        layDownSkid(skidPool, rrx, rrz, car.yaw);
        skidPool.lastX = rlx;
        skidPool.lastZ = rlz;
      }

      smokePool.spawn(rlx, 0.15, rlz, car.speed * fwd.x, car.speed * fwd.z);
      smokePool.spawn(rrx, 0.15, rrz, car.speed * fwd.x, car.speed * fwd.z);
    } else {
      skidPool.lastX = null;
      skidPool.lastZ = null;
    }

    shakeImpulse = Math.max(0, shakeImpulse - dt * 1.3);

    if (speedEl) speedEl.textContent = speedKmH.toString();

    // Render Sports Tachometer
    renderSportsGaugeCanvas(speedKmH);

    // Drift Banner
    if (driftBanner) {
      if (car.driftDisplayTimer > 0) {
        driftBanner.style.display = 'block';
        driftBanner.innerHTML = `
          <div style="font-size: 18px; color: #00ffcc; margin-bottom: 2px;">DRIFT ANGLE ${car.driftAngleDeg}&deg;</div>
          <div>${car.driftScore.toLocaleString()} <span style="font-size: 18px; color: #ffdd44;">x${car.driftCombo.toFixed(1)}</span></div>
        `;
      } else {
        driftBanner.style.display = 'none';
      }
    }

    // Camera Toast Timer
    if (cameraToastTimer > 0) {
      cameraToastTimer -= dt;
      if (cameraToastTimer <= 0 && cameraToast) {
        cameraToast.style.opacity = '0';
        setTimeout(() => {
          if (cameraToastTimer <= 0) cameraToast.style.display = 'none';
        }, 250);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Canvas Cockpit Sports Instrument Cluster
  // -------------------------------------------------------------------------
  function renderSportsGaugeCanvas(speedKmH) {
    if (!hudCtx || !sportsHudWrap || sportsHudWrap.style.display === 'none') return;

    // Temporarily hide if full map is opened
    const mapEl = document.getElementById('minimap');
    if (mapEl && mapEl.classList.contains('expanded')) {
      sportsHudWrap.style.opacity = '0';
      return;
    } else {
      sportsHudWrap.style.opacity = '1';
    }

    const ctx = hudCtx;
    ctx.clearRect(0, 0, 380, 380);

    const cx = 190;
    const cy = 190;
    const radius = 142;

    // Dark dial background with neon trim
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12, 14, 18, 0.90)';
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.35)';
    ctx.stroke();

    // Tachometer Arc
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const totalAngle = endAngle - startAngle;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.stroke();

    // Yellow warning arc
    const yellowStart = startAngle + totalAngle * (6500 / REDLINE_RPM);
    const yellowEnd = startAngle + totalAngle * (7400 / REDLINE_RPM);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, yellowStart, yellowEnd);
    ctx.strokeStyle = 'rgba(255, 180, 0, 0.75)';
    ctx.stroke();

    // Redline arc
    ctx.beginPath();
    ctx.arc(cx, cy, radius, yellowEnd, endAngle);
    ctx.strokeStyle = 'rgba(255, 30, 40, 0.95)';
    ctx.stroke();

    // RPM fill arc
    const rpmFrac = THREE.MathUtils.clamp(car.rpm / REDLINE_RPM, 0, 1);
    const currentRpmAngle = startAngle + totalAngle * rpmFrac;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, currentRpmAngle);
    ctx.lineWidth = 12;
    ctx.strokeStyle = rpmFrac > 0.90 ? '#ff1133' : '#00ddff';
    ctx.stroke();

    // Tick marks
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    for (let r = 0; r <= 8; r++) {
      const angle = startAngle + totalAngle * (r / (REDLINE_RPM / 1000));
      const tx = cx + Math.cos(angle) * (radius - 24);
      const ty = cy + Math.sin(angle) * (radius - 24);
      ctx.fillText(r.toString(), tx, ty);
    }

    // Needle
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(currentRpmAngle);
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(radius - 10, 0);
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = '#ff2233';
    ctx.shadowColor = '#ff1122';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.restore();

    // Center Hub
    ctx.beginPath();
    ctx.arc(cx, cy, 24, 0, Math.PI * 2);
    ctx.fillStyle = '#181b20';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#3a3f48';
    ctx.stroke();

    // Digital Speed (km/h)
    ctx.font = '800 54px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 220, 255, 0.4)';
    ctx.shadowBlur = 8;
    ctx.fillText(speedKmH.toString(), cx, cy - 44);
    ctx.shadowBlur = 0;

    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillText('KM/H', cx, cy - 14);

    // Drive Mode Indicator (D / R / P)
    ctx.font = '800 34px system-ui, sans-serif';
    const driveMode = car.speed < -0.3 ? 'R' : (Math.abs(car.speed) < 0.2 ? 'P' : 'D');
    ctx.fillStyle = driveMode === 'R' ? '#ff9900' : '#00ffd5';
    ctx.fillText(driveMode, cx, cy + 40);

    // Current vehicle. The key hints that used to sit here were ~5 px tall on
    // screen; they live in the Controls panel (H) instead.
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(0, 220, 255, 0.85)';
    ctx.fillText(CAR_PRESETS[currentCarPresetIndex].name.toUpperCase(), cx, cy + 74);
  }

  // -------------------------------------------------------------------------
  // GTA-Style Multi-Camera Perspectives & Orbit Controller
  // -------------------------------------------------------------------------
  function stepCamera(dt) {
    const fwd = forwardOf(car.yaw);
    const rgt = rightOf(car.yaw);
    const mode = GTA_CAMERA_MODES[cameraViewMode];

    // Check if player is holding R for Rear-View Mirror look
    const lookBehind = keys.has('KeyR');

    // Smoothly snap mouse orbit back behind car when not holding right-click freelook
    if (mouseActiveTimer > 0) {
      mouseActiveTimer -= dt;
    } else {
      mouseOrbitYaw *= Math.exp(-12.0 * dt);
      mouseOrbitPitch *= Math.exp(-12.0 * dt);
    }

    let targetX, targetY, targetZ;
    let lookX, lookY, lookZ;

    if (mode.type === 'chase') {
      if (camChaseYaw === null) camChaseYaw = car.yaw;
      let diff = car.yaw - camChaseYaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      camChaseYaw += diff * (1 - Math.exp(-11.0 * dt));

      // Effective camera yaw incorporating smoothly trailing chase yaw, lookBehind flip, and mouse orbit
      const effectiveYaw = camChaseYaw + (lookBehind ? Math.PI : 0) + mouseOrbitYaw;
      const camFwd = forwardOf(effectiveYaw);

      targetX = car.x - camFwd.x * mode.dist;
      targetZ = car.z - camFwd.z * mode.dist;
      targetY = mode.height + Math.sin(mouseOrbitPitch) * mode.dist;

      lookX = car.x;
      lookY = mode.lookY;
      lookZ = car.z;
    } else if (mode.type === 'cockpit') {
      // Inside cabin at driver seat position, turns directly with car body
      const effectiveYaw = car.yaw + (lookBehind ? Math.PI : 0) + mouseOrbitYaw * 0.5;
      const viewFwd = forwardOf(effectiveYaw);

      targetX = car.x + rgt.x * mode.posX + fwd.x * mode.posZ;
      targetZ = car.z + rgt.z * mode.posX + fwd.z * mode.posZ;
      targetY = mode.posY;

      lookX = targetX + viewFwd.x * 20;
      lookY = targetY + Math.sin(mouseOrbitPitch) * 10;
      lookZ = targetZ + viewFwd.z * 20;
    } else if (mode.type === 'hood') {
      // Mounted low on the hood looking forward
      const effectiveYaw = car.yaw + (lookBehind ? Math.PI : 0);
      const viewFwd = forwardOf(effectiveYaw);

      targetX = car.x + viewFwd.x * mode.posZ;
      targetZ = car.z + viewFwd.z * mode.posZ;
      targetY = mode.posY;

      lookX = targetX + viewFwd.x * 25;
      lookY = targetY;
      lookZ = targetZ + viewFwd.z * 25;
    } else {
      // Bumper Cam (asphalt-level racing)
      const effectiveYaw = car.yaw + (lookBehind ? Math.PI : 0);
      const viewFwd = forwardOf(effectiveYaw);

      targetX = car.x + viewFwd.x * mode.posZ;
      targetZ = car.z + viewFwd.z * mode.posZ;
      targetY = mode.posY;

      lookX = targetX + viewFwd.x * 30;
      lookY = targetY;
      lookZ = targetZ + viewFwd.z * 30;
    }

    if (!camInit || mode.type !== 'chase') {
      // Body-mounted views must not lag behind the car and slide through its geometry.
      camPos.set(targetX, targetY, targetZ);
      camInit = true;
    } else {
      // Snappier follow for chase mode so turns stay centered on the road ahead
      const smoothRate = mode.type === 'chase' ? (lookBehind ? 24.0 : 16.0) : 24.0;
      const t = 1 - Math.exp(-smoothRate * dt);
      camPos.x += (targetX - camPos.x) * t;
      camPos.y += (targetY - camPos.y) * t;
      camPos.z += (targetZ - camPos.z) * t;
    }

    // Dynamic FOV linked to speed
    const speedFrac = THREE.MathUtils.clamp(Math.abs(car.speed) / MAX_SPEED_FORWARD, 0, 1);
    const targetFov = mode.fov + (mode.type === 'chase' ? 14 * speedFrac : 8 * speedFrac);
    displayFov += (targetFov - displayFov) * (1 - Math.exp(-5.0 * dt));
    camera.fov = displayFov;
    camera.updateProjectionMatrix();

    // Road jitter & collision camera shake
    const shakeAmpl = 0.007 * speedFrac + shakeImpulse * 0.35;
    const tTime = performance.now() / 1000;
    const shakeX = Math.sin(tTime * 32.0) * shakeAmpl;
    const shakeY = Math.sin(tTime * 24.5 + 1.2) * shakeAmpl * 0.6;

    camera.position.set(camPos.x + shakeX, camPos.y + shakeY, camPos.z);
    camera.lookAt(lookX, lookY, lookZ);
  }

  mirpur.drive = {
    get driving() { return driving; },
    look(dx, dy) {
      mouseOrbitYaw -= dx * 0.0035;
      mouseOrbitPitch = THREE.MathUtils.clamp(mouseOrbitPitch - dy * 0.0025, -0.32, 0.4);
      mouseActiveTimer = 0.65;
    },
    cycleCamera() {
      camChaseYaw = null;
      cameraViewMode = (cameraViewMode + 1) % GTA_CAMERA_MODES.length;
      camInit = false;
      showCameraToast(`CAMERA: ${GTA_CAMERA_MODES[cameraViewMode].name}`);
    },
    toggleDrive,
  };
  const clearInput = () => { keys.clear(); playHorn(false); };
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', clearInput);

  // Main animation loop
  let lastT = performance.now();
  function loop() {
    requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    if (player.switching || isGameplayBlocked() || document.hidden) { clearInput(); return; }
    if (driving && car) {
      stepCar(dt);
      stepCamera(dt);
    }
  }
  requestAnimationFrame(loop);

  // Debug Hook for Automated Review & QA
  window.__driveDebug = {
    tick(dt = 1 / 60) {
      if (driving && car) {
        stepCar(dt);
        stepCamera(dt);
      }
    },
    press(code) {
      keys.add(code);
    },
    release(code) {
      keys.delete(code);
    },
    get driving() {
      return driving;
    },
    get car() {
      return car ? { ...car } : null;
    },
    get cameraMode() {
      return GTA_CAMERA_MODES[cameraViewMode].name;
    },
    get usingModel() {
      return carMesh ? carMesh.usingModel : null;
    },
    get carPreset() {
      return CAR_PRESETS[currentCarPresetIndex].name;
    },
    switchCar(idx) {
      switchCarPreset(idx);
    },
    get audioState() {
      return audio
        ? {
            state: audio.ctx.state,
            rms: readAnalyserRMS(),
            muted,
            engineGain: audio.engineGain.gain.value,
            engineNoiseGain: audio.engineNoiseGain.gain.value,
            skidGain: audio.skidGain.gain.value,
          }
        : null;
    },
    stopCarAudio,
    toggleDrive,
    playHorn,
  };
}

// ---------------------------------------------------------------------------
// Polling for window.__mirpur
// ---------------------------------------------------------------------------
function waitForMirpur() {
  if (window.__mirpur && window.__mirpur.player && window.__mirpur.collision) {
    initDrive(window.__mirpur);
  } else {
    setTimeout(waitForMirpur, 250);
  }
}
waitForMirpur();
