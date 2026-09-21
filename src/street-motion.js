/**
 * street-motion.js
 *
 * Small things that move, so a street with nobody on it still is not still:
 *
 *  - crows and kites (চিল) wheeling overhead: one instanced draw call, flown
 *    entirely in the vertex shader;
 *  - a shared puff pool: diesel smoke off the buses, the blue haze behind a
 *    CNG, dust off a bus's wheels in the dry and spray in the wet, steam off
 *    every cha stall's kettle. One THREE.Points draw call, ~200 particles;
 *  - tube lights under the stall tarps and over the building sites, a few of
 *    which flicker the way a tired choke makes them. Night only.
 *
 * Four draw calls in all (three of them only at night). Laundry and festoons
 * flap in src/street-clutter.js's cloth shader.
 */
import * as THREE from 'three';

const BIRD_BOX = 640; // m; birds are world-anchored and wrap inside a box this wide around the viewer
const KITES = 14;
const CROWS = 28;
const PUFFS = 220;
const EMIT_RANGE = 75; // m; vehicles and stalls further than this make no puffs
const MAX_EMITTING_VEHICLES = 10;
const HALF_LEN = { bus: 5.0, cng: 1.4 };

// kind -> colour, start/end size (m), life (s), rise (m/s), start alpha
const PUFF_KINDS = {
  diesel: { colour: 0x2b2a2c, size: [0.35, 1.9], life: 1.9, rise: 0.75, alpha: 0.5 },
  cng: { colour: 0x9aa6b4, size: [0.2, 1.0], life: 1.3, rise: 0.5, alpha: 0.32 },
  dust: { colour: 0xb9a582, size: [0.5, 2.6], life: 2.2, rise: 0.25, alpha: 0.3 },
  spray: { colour: 0xdfe6ea, size: [0.4, 1.7], life: 0.9, rise: 0.9, alpha: 0.4 },
  steam: { colour: 0xf4f4f0, size: [0.12, 0.7], life: 1.7, rise: 0.6, alpha: 0.42 },
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Birds
// ---------------------------------------------------------------------------

function buildBirds(uniforms) {
  // Span along x, nose at +z. Two wings of two triangles; the tips flap.
  const base = new THREE.BufferGeometry();
  base.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0.32, 0, 0, -0.3, -0.85, 0, -0.12,
    0, 0, 0.32, 0.85, 0, -0.12, 0, 0, -0.3,
    0, 0, -0.3, -0.16, 0, -0.55, 0.16, 0, -0.55,
  ], 3));
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', base.getAttribute('position'));
  const rnd = mulberry32(1971);
  const count = KITES + CROWS;
  const orbit = new Float32Array(count * 4); // centre x, centre z, radius, height
  const motion = new Float32Array(count * 4); // angular speed, phase, flap rate, size
  for (let i = 0; i < count; i++) {
    const kite = i < KITES;
    // Crows travel in loose gangs: every fourth one picks a new spot, the rest stay near it.
    const gang = kite || i % 4 === 0 || i === KITES;
    const cx = gang ? rnd() * BIRD_BOX : orbit[(i - 1) * 4] + (rnd() - 0.5) * 30;
    const cz = gang ? rnd() * BIRD_BOX : orbit[(i - 1) * 4 + 1] + (rnd() - 0.5) * 30;
    const radius = kite ? 28 + rnd() * 55 : 7 + rnd() * 24;
    const speed = (kite ? 9 + rnd() * 3 : 8 + rnd() * 5) / radius * (rnd() < 0.5 ? -1 : 1); // m/s over the circle
    orbit.set([cx, cz, radius, kite ? 55 + rnd() * 90 : 13 + rnd() * 26], i * 4);
    motion.set([speed, rnd() * Math.PI * 2, kite ? 0.9 + rnd() * 0.6 : 7 + rnd() * 3, kite ? 1.5 + rnd() * 0.5 : 0.55 + rnd() * 0.2], i * 4);
  }
  geometry.setAttribute('orbit', new THREE.InstancedBufferAttribute(orbit, 4));
  geometry.setAttribute('motion', new THREE.InstancedBufferAttribute(motion, 4));
  geometry.instanceCount = count;

  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 }, viewer: { value: new THREE.Vector2() }, tint: { value: new THREE.Color(0x15130f) } }]),
    fog: true,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec4 orbit;
      attribute vec4 motion;
      uniform float time;
      uniform vec2 viewer;
      #include <fog_pars_vertex>
      void main() {
        float a = motion.y + time * motion.x;
        // World-anchored, wrapped into a box round the viewer: far enough out that the wrap is a speck.
        vec2 home = viewer + mod(orbit.xy - viewer + ${(BIRD_BOX / 2).toFixed(1)}, ${BIRD_BOX.toFixed(1)}) - ${(BIRD_BOX / 2).toFixed(1)};
        vec3 centre = vec3(home.x + cos(a) * orbit.z, orbit.w + sin(time * 0.31 + motion.y * 3.0) * 5.0, home.y + sin(a) * orbit.z);
        vec2 ahead = vec2(-sin(a), cos(a)) * sign(motion.x);
        vec3 local = position * motion.w;
        float reach = abs(position.x);
        float glide = clamp(motion.z / 9.0, 0.1, 0.62);
        local.y += reach * sin(time * motion.z + motion.y * 7.0) * glide * motion.w;
        local.y += position.x * 0.28 * sign(motion.x) * motion.w; // banked into the turn
        vec3 world = centre + vec3(ahead.y, 0.0, -ahead.x) * local.x + vec3(0.0, 1.0, 0.0) * local.y + vec3(ahead.x, 0.0, ahead.y) * local.z;
        vec4 mvPosition = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 tint;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(tint, 1.0);
        #include <fog_fragment>
      }`,
  });
  material.uniforms.time = uniforms.time;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'motion-birds';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  return { mesh, geometry, viewer: material.uniforms.viewer.value, count };
}

// ---------------------------------------------------------------------------
// Puffs
// ---------------------------------------------------------------------------

function buildPuffs() {
  const position = new Float32Array(PUFFS * 3);
  const look = new Float32Array(PUFFS * 2); // size (m), alpha
  const colour = new Float32Array(PUFFS * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('look', new THREE.BufferAttribute(look, 2).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { scale: { value: 600 }, maxSize: { value: 160 } }]),
    fog: true, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute vec2 look;
      attribute vec3 color;
      uniform float scale;
      uniform float maxSize;
      varying vec4 vLook;
      #include <fog_pars_vertex>
      void main() {
        vLook = vec4(color, look.y);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        // Capped: a puff drifting past the lens would otherwise be a screen-sized
        // alpha-blended sprite, which is exactly what a phone GPU cannot afford.
        gl_PointSize = min(look.x * scale / max(0.1, -mvPosition.z), maxSize);
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      varying vec4 vLook;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float soft = 1.0 - smoothstep(0.25, 1.0, d);
        if (soft * vLook.a < 0.004) discard;
        gl_FragColor = vec4(vLook.rgb, soft * vLook.a);
        #include <fog_fragment>
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'motion-puffs';
  points.frustumCulled = false;
  points.matrixAutoUpdate = false;
  points.renderOrder = 5; // after monsoon.js's water, which would otherwise blend over them

  const live = Array.from({ length: PUFFS }, () => ({ age: 0, life: 0, vx: 0, vy: 0, vz: 0, kind: null }));
  const tint = new THREE.Color();
  let cursor = 0;
  let born = false;
  let alive = 0;

  function emit(kindName, x, y, z, vx, vz, jitter = 0.25) {
    const kind = PUFF_KINDS[kindName];
    const p = live[cursor];
    const i = cursor;
    cursor = (cursor + 1) % PUFFS;
    p.kind = kind; p.age = 0; p.life = kind.life * (0.75 + Math.random() * 0.5);
    p.vx = vx + (Math.random() - 0.5) * jitter; p.vy = kind.rise * (0.7 + Math.random() * 0.6); p.vz = vz + (Math.random() - 0.5) * jitter;
    position[i * 3] = x; position[i * 3 + 1] = y; position[i * 3 + 2] = z;
    tint.setHex(kind.colour); colour[i * 3] = tint.r; colour[i * 3 + 1] = tint.g; colour[i * 3 + 2] = tint.b;
    born = true;
  }

  function update(dt, windX, windZ) {
    if (!alive && !born) { points.visible = false; return; } // nothing in the air: no draw call, no uploads
    points.visible = true;
    alive = 0;
    for (let i = 0; i < PUFFS; i++) {
      const p = live[i];
      if (!p.kind) continue;
      alive++;
      p.age += dt;
      if (p.age >= p.life) { p.kind = null; look[i * 2 + 1] = 0; continue; }
      const t = p.age / p.life;
      p.vx += (windX - p.vx) * dt * 0.9; p.vz += (windZ - p.vz) * dt * 0.9; // picked up by the breeze
      position[i * 3] += p.vx * dt; position[i * 3 + 1] += p.vy * dt; position[i * 3 + 2] += p.vz * dt;
      look[i * 2] = p.kind.size[0] + (p.kind.size[1] - p.kind.size[0]) * Math.sqrt(t);
      look[i * 2 + 1] = p.kind.alpha * (1 - t) * Math.min(1, t * 8);
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.look.needsUpdate = true;
    if (born) { geometry.attributes.color.needsUpdate = true; born = false; }
  }

  return { points, emit, update, material };
}

// ---------------------------------------------------------------------------
// Tube lights
// ---------------------------------------------------------------------------

function buildTubes(spots, uniforms) {
  if (!spots.length) return null;
  const group = new THREE.Group();
  group.name = 'motion-tube-lights';
  const flicker = (material) => {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.motionTime = uniforms.time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float motionTime;\nvarying float vFlicker;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float id = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.11;
          float tired = step(0.7, fract(id)); // about one tube in three has a failing choke
          float fit = step(fract(motionTime * 0.19 + id), 0.4); // and it only acts up in fits
          float strobe = step(0.45, fract(sin(floor(motionTime * 17.0) + id * 91.7) * 43758.5453));
          vFlicker = mix(1.0, mix(0.12, 1.0, strobe), tired * fit);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFlicker;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vFlicker;');
    };
    return material;
  };

  const tubeGeometry = new THREE.CylinderGeometry(0.022, 0.022, 1.2, 6);
  tubeGeometry.rotateZ(Math.PI / 2);
  const tubes = new THREE.InstancedMesh(tubeGeometry, flicker(new THREE.MeshBasicMaterial({ color: 0xe9f3ff, toneMapped: false })), spots.length);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, 'rgba(255,255,255,1)'); glow.addColorStop(0.45, 'rgba(255,255,255,0.35)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 64, 64);
  const poolGeometry = new THREE.PlaneGeometry(1, 1);
  poolGeometry.rotateX(-Math.PI / 2);
  const pools = new THREE.InstancedMesh(poolGeometry, flicker(new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(canvas), color: 0xbfd6ee, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  })), spots.length);

  const dummy = new THREE.Object3D();
  spots.forEach((spot, i) => {
    dummy.position.set(spot.x, spot.y, spot.z); dummy.rotation.set(0, spot.yaw, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
    tubes.setMatrixAt(i, dummy.matrix);
    dummy.position.set(spot.x, 0.14, spot.z); dummy.scale.set(6.5, 1, 5); dummy.updateMatrix();
    pools.setMatrixAt(i, dummy.matrix);
  });
  for (const mesh of [tubes, pools]) { mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.instanceMatrix.needsUpdate = true; group.add(mesh); }
  pools.renderOrder = 2;
  group.visible = false;
  return group;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * @param {{ traffic: object, sky: object, stalls?: {x: number, z: number, yaw: number}[], sites?: {x: number, z: number, yaw?: number}[] }} deps
 */
export function createStreetMotion({ traffic, sky, stalls = [], sites = [] }) {
  const group = new THREE.Group(); group.name = 'street-motion';
  group.userData.cinematicIgnore = true; // src/cinematic-clearance.js: dressing, not an obstacle
  const uniforms = { time: { value: 0 } };
  const birds = buildBirds(uniforms);
  const puffs = buildPuffs();
  // Under the front edge of each stall's tarp (front is +Z), and slung over each building site.
  const tubeSpots = [
    ...stalls.map((s) => ({ x: s.x + Math.sin(s.yaw) * 0.8, y: 2.02, z: s.z + Math.cos(s.yaw) * 0.8, yaw: s.yaw })),
    ...sites.map((s) => ({ x: s.x, y: 2.6, z: s.z, yaw: s.yaw ?? 0 })),
  ];
  const tubes = buildTubes(tubeSpots, uniforms);
  group.add(birds.mesh, puffs.points);
  if (tubes) group.add(tubes);

  let raining = false;
  let rate = 1; // emission multiplier; 0.45 on the low tier
  let floods = []; // [{x, z, r}] from monsoon.js while it rains
  let emitClock = 0;
  const near = [];

  /**
   * @param {number} dt @param {number} elapsed
   * @param {{x: number, y: number, z: number}} viewPos
   * @param {{ height?: number }} [view] drawing-buffer height and camera fov, to size the puffs
   */
  function update(dt, elapsed, viewPos, view = {}) {
    uniforms.time.value = elapsed;
    birds.viewer.set(viewPos.x, viewPos.z);
    const dark = sky?.isDark ?? false;
    birds.mesh.visible = !dark;
    birds.geometry.instanceCount = Math.round(birds.count * (raining ? 0.3 : 1) * (rate < 1 ? 0.6 : 1));
    if (tubes) tubes.visible = dark;
    if (view.height) {
      puffs.material.uniforms.scale.value = view.height / (2 * Math.tan(THREE.MathUtils.degToRad(view.fov ?? 68) / 2));
      puffs.material.uniforms.maxSize.value = view.height * (rate < 1 ? 0.1 : 0.16);
    }

    // Emission runs at 20 Hz; the pool itself integrates every frame.
    emitClock += dt;
    if (emitClock >= 0.05) {
      const step = emitClock; emitClock = 0;
      near.length = 0;
      for (const sys of traffic?.systems ?? []) {
        if (sys.type !== 'bus' && sys.type !== 'cng') continue;
        for (const a of sys.agents) {
          if (a._wx === undefined || a.hidden || a.wreck || a._hx === undefined) continue;
          const d = Math.hypot(a._wx - viewPos.x, a._wz - viewPos.z);
          if (d < EMIT_RANGE) near.push({ a, d, type: sys.type });
        }
      }
      near.sort((p, q) => p.d - q.d);
      const budget = step * rate;
      for (const { a, type } of near.slice(0, rate < 1 ? 5 : MAX_EMITTING_VEHICLES)) {
        const pace = Math.abs(a.speed * (a.brakeMul ?? 1));
        if (pace < 0.4) continue;
        const back = HALF_LEN[type];
        const tx = a._wx - a._hx * back; const tz = a._wz - a._hz * back;
        const wading = raining && floods.some((f) => Math.hypot(a._wx - f.x, a._wz - f.z) < f.r * 0.85);
        if (wading) {
          // Bow wave and wheel wash, both sides.
          for (const side of [-1, 1]) if (Math.random() < budget * 14) puffs.emit('spray', a._wx + a._hx * back * 0.6 - a._hz * side * 0.9, 0.5, a._wz + a._hz * back * 0.6 + a._hx * side * 0.9, a._hx * pace * 0.3 - a._hz * side * 1.4, a._hz * pace * 0.3 + a._hx * side * 1.4, 0.6);
          continue;
        }
        // Pulling away from a stop is when the smoke really comes.
        const effort = 0.6 + (1 - Math.min(1, a.brakeMul ?? 1)) * 1.6;
        if (Math.random() < budget * (type === 'bus' ? 7 : 4) * effort) puffs.emit(type === 'bus' ? 'diesel' : 'cng', tx - a._hz * (type === 'bus' ? 0.8 : 0.3), type === 'bus' ? 0.55 : 0.35, tz + a._hx * (type === 'bus' ? 0.8 : 0.3), -a._hx * 0.8, -a._hz * 0.8);
        if (type === 'bus' && pace > 2.5 && Math.random() < budget * 5) {
          const side = Math.random() < 0.5 ? -1 : 1;
          puffs.emit(raining ? 'spray' : 'dust', tx - a._hz * side * 1.1, 0.18, tz + a._hx * side * 1.1, -a._hx * 0.4, -a._hz * 0.4, 0.8);
        }
      }
      for (const stall of stalls) {
        if (Math.hypot(stall.x - viewPos.x, stall.z - viewPos.z) > EMIT_RANGE * 0.7) continue;
        // The kettle sits at local (-0.55, 1.25, 0); see streetlife/world.js.
        if (Math.random() < budget * 6) puffs.emit('steam', stall.x - Math.cos(stall.yaw) * 0.55, 1.3, stall.z + Math.sin(stall.yaw) * 0.55, 0, 0, 0.08);
      }
    }
    puffs.update(dt, raining ? 1.6 : 0.5, raining ? 0.7 : 0.2);
  }

  return {
    group,
    update,
    /** @param {'high' | 'low' | 'minimal'} tier low: under half the puffs, smaller sprites, fewer birds, no light pools */
    setQuality(tier) {
      rate = tier === 'high' ? 1 : 0.45;
      const pools = tubes?.children[1];
      if (pools) pools.visible = tier === 'high';
    },
    /** monsoon.js: spray instead of dust, fewer birds, and where vehicles are wading. */
    setRain(on, floodZones = []) { raining = on; floods = on ? floodZones : []; },
    stats: { birds: birds.count, puffs: PUFFS, tubes: tubeSpots.length },
  };
}
