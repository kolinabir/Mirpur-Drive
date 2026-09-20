import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// DOM mocks
const ctxStub = new Proxy({}, { get: () => () => {} });
globalThis.document = {
  createElement: () => ({
    width: 256,
    height: 128,
    getContext: () => ctxStub,
    style: {},
    appendChild: () => {},
    classList: { add: () => {}, remove: () => {} },
  }),
  querySelector: () => null,
  getElementById: () => null,
};
globalThis.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
};

const scene = JSON.parse(readFileSync(resolve(ROOT, 'public/scene-north.json'), 'utf8'));

const { buildMetro, METRO } = await import(resolve(ROOT, 'src/metro.js'));
const { createStationLife } = await import(resolve(ROOT, 'src/stationlife.js'));
const { createInteriorSystem } = await import(resolve(ROOT, 'src/interior.js'));

console.log('=== Test 1: Metro Alignment & Stations ===');
console.log('Stations in scene.metro:', scene.metro.stations.map(s => s.name));

const threeScene = new THREE.Scene();
const labelFactory = () => new THREE.Object3D();
const metro = buildMetro(scene, labelFactory);
console.log('metro.stationOrder:', metro.stationOrder);

// Verify Mirpur 11
const m11 = metro.stations.find(s => s.name === 'Mirpur 11');
if (!m11) throw new Error('Mirpur 11 station not found in metro!');
console.log('Mirpur 11 at x =', m11.x, 'z =', m11.z);

console.log('\n=== Test 2: Train Berthing in Both Directions at Mirpur 11 ===');
let berthedNorth = false;
let berthedSouth = false;

for (let t = 0; t < 300; t += 0.2) {
  metro.update(t);
  for (const tr of metro.trains) {
    const dist = Math.hypot(tr.obj.position.x - m11.x, tr.obj.position.z - m11.z);
    if (dist < 8) {
      if (tr.dir > 0 && !berthedNorth) {
        berthedNorth = true;
        console.log(`Northbound train berthed at t=${t.toFixed(1)}s, dist=${dist.toFixed(2)}m, pos=(${tr.obj.position.x.toFixed(1)}, ${tr.obj.position.z.toFixed(1)})`);
      }
      if (tr.dir < 0 && !berthedSouth) {
        berthedSouth = true;
        console.log(`Southbound train berthed at t=${t.toFixed(1)}s, dist=${dist.toFixed(2)}m, pos=(${tr.obj.position.x.toFixed(1)}, ${tr.obj.position.z.toFixed(1)})`);
      }
    }
  }
  if (berthedNorth && berthedSouth) break;
}

if (!berthedNorth || !berthedSouth) {
  throw new Error(`Failed berthing: north=${berthedNorth}, south=${berthedSouth}`);
}
console.log('PASS: Trains berth at Mirpur 11 in both directions!');

const { createWalkableRegistry } = await import(resolve(ROOT, 'src/walkable.js'));
const walkable = createWalkableRegistry();
const collision = { cell: 10, grid: new Map(), addSegments: () => {} };
walkable.addSegments = (s) => {};

const interior = createInteriorSystem(threeScene, metro, walkable, collision);

// Force build interior for Mirpur 11 and neighboring stations
for (const st of metro.stations) {
  interior.update(0, { position: new THREE.Vector3(st.x, METRO.PLATFORM_Y, st.z), forward: () => new THREE.Vector3(0, 0, 1) });
}

const interiorM11 = threeScene.getObjectByName('interior:Mirpur 11');
if (!interiorM11) throw new Error('interior:Mirpur 11 not found in scene!');

let signDescriptions = [];
interiorM11.traverse((child) => {
  if (child.name) signDescriptions.push(child.name);
});
console.log(`Found ${signDescriptions.length} named elements in Mirpur 11 interior`);

console.log('\n=== Test 4: Boarding & Riding Simulation at Mirpur 11 ===');
const dummyCamera = new THREE.PerspectiveCamera();
const dummyPlayer = {
  position: new THREE.Vector3(m11.x + Math.cos(m11.heading) * 4.55, METRO.PLATFORM_Y + 1.68, m11.z - Math.sin(m11.heading) * 4.55),
  velocity: new THREE.Vector3(0, 0, 0),
  feetY: METRO.PLATFORM_Y,
  flying: false,
  yaw: 0,
  pitch: 0,
  camera: dummyCamera,
  forward: () => new THREE.Vector3(0, 0, 1),
  teleport(x, z, y, yaw) {
    this.position.set(x, y, z);
    this.feetY = y;
    this.yaw = yaw || 0;
  },
  keys: new Set(),
};

const stationLife = createStationLife(
  threeScene,
  metro,
  walkable,
  collision,
  dummyPlayer,
  interior
);

console.log('Advancing time to test boarding...');
let boardTestedNorth = false;
let boardTestedSouth = false;

for (let t = 0; t < 600; t += 0.5) {
  metro.update(t);
  stationLife.update(0.5, dummyPlayer);

  const interactable = stationLife.state.interactables.find(i => i.label && i.label.includes('board train'));
  if (interactable) {
    const prompt = interactable.label;

    if (prompt.includes('Pallabi') && !boardTestedNorth) {
      boardTestedNorth = true;
      console.log(`[t=${t.toFixed(1)}s] Prompt: "${prompt}" -> Boarding NORTHBOUND train to Pallabi!`);
      stationLife.interact(dummyPlayer);
      console.log('>> Player riding state:', stationLife.state.riding, 'nextStop:', stationLife.state.nextStopName);

      let arrivedAtPallabi = false;
      for (let rideT = t + 0.5; rideT < t + 200; rideT += 0.5) {
        metro.update(rideT);
        stationLife.update(0.5, dummyPlayer);
        const pallabi = metro.stations.find(s => s.name === 'Pallabi');
        const distToPallabi = Math.hypot(dummyPlayer.position.x - pallabi.x, dummyPlayer.position.z - pallabi.z);
        if (distToPallabi < 20) {
          console.log(`>> Reached Pallabi! Player dist = ${distToPallabi.toFixed(1)}m`);
          arrivedAtPallabi = true;
          stationLife.alight(dummyPlayer); // alight
          t = rideT;
          break;
        }
      }
      if (!arrivedAtPallabi) throw new Error('Northbound train did not reach Pallabi!');
      // Position player on Platform 1 (southbound, side -1) at Mirpur 11
      dummyPlayer.teleport(
        m11.x - Math.cos(m11.heading) * 4.55,
        m11.z + Math.sin(m11.heading) * 4.55,
        METRO.PLATFORM_Y + 1.68,
        0
      );
      dummyPlayer.feetY = METRO.PLATFORM_Y;
    } else if (prompt.includes('Mirpur 10') && !boardTestedSouth) {
      boardTestedSouth = true;
      console.log(`[t=${t.toFixed(1)}s] Prompt: "${prompt}" -> Boarding SOUTHBOUND train to Mirpur 10!`);
      stationLife.interact(dummyPlayer);
      console.log('>> Player riding state:', stationLife.state.riding, 'nextStop:', stationLife.state.nextStopName);

      let arrivedAtM10 = false;
      for (let rideT = t + 0.5; rideT < t + 200; rideT += 0.5) {
        metro.update(rideT);
        stationLife.update(0.5, dummyPlayer);
        const m10 = metro.stations.find(s => s.name === 'Mirpur 10');
        const distToM10 = Math.hypot(dummyPlayer.position.x - m10.x, dummyPlayer.position.z - m10.z);
        if (distToM10 < 20) {
          console.log(`>> Reached Mirpur 10! Player dist = ${distToM10.toFixed(1)}m`);
          arrivedAtM10 = true;
          stationLife.alight(dummyPlayer); // alight
          t = rideT;
          break;
        }
      }
      if (!arrivedAtM10) throw new Error('Southbound train did not reach Mirpur 10!');
    }
  }

  if (boardTestedNorth && boardTestedSouth) {
    break;
  }
}

if (!boardTestedNorth || !boardTestedSouth) {
  throw new Error(`Boarding test incomplete: north=${boardTestedNorth}, south=${boardTestedSouth}`);
}

console.log('\n=============================================');
console.log('ALL METRO MIRPUR 11 TESTS PASSED!');
console.log('=============================================');
process.exit(0);
