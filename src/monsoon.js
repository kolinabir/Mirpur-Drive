/**
 * monsoon.js
 *
 * বর্ষা. One of the game's own cha-stall lines is "One shower of rain and
 * Kazipara is a river", so when it rains here it rains like that:
 *
 *  - rain: line streaks in a box that travels with the camera and wraps in
 *    the vertex shader (no CPU per drop);
 *  - an overcast grade laid over whatever time of day sky.js has set: grey
 *    fog pulled in close, the sun turned down, the clouds closed up;
 *  - wet ground: one camera-following sheet just above the road surface that
 *    darkens the tarmac, throws the sky back at grazing angles, and opens
 *    into puddles ringed by raindrops;
 *  - জলাবদ্ধতা: standing brown water around Mirpur 10 and Kazipara, deep
 *    enough that rickshaws and walkers wade through it to the hub and knee.
 *    Nothing is simulated: the water is a surface at +0.42 m and the traffic
 *    simply drives through it;
 *  - umbrellas over the nearest pedestrians, rain noise, distant thunder.
 *
 * Everything fades with one 0..1 `wet` value so a shower arrives and clears
 * over a few seconds instead of switching. Five draw calls while wet, none
 * when dry. The water shader is the one real fill cost in here; see
 * noiseTexture() and setQuality() for how it is kept cheap.
 */
import * as THREE from 'three';
import { getAudioContext, whiteNoiseBuffer } from './audio.js';

const DROPS = 2600;
const RAIN_BOX = new THREE.Vector3(46, 30, 46); // m, the wrapped volume around the camera
const SHEET = 360; // m, side of the wet-ground sheet
const SHEET_Y = 0.13; // road and footpath surfaces sit at about 0.10
const FLOOD_Y = 0.42;
const FLOOD_STATIONS = [['Mirpur 10', 150], ['Kazipara', 170]]; // station name, radius (m)
const UMBRELLAS = 46;
const UMBRELLA_RANGE = 70;
const UMBRELLA_COLOURS = [0x16161a, 0x16161a, 0x16161a, 0x1d3f8f, 0xb3171d, 0x0b6b3a, 0x7b2d8b, 0xd9c8a6];
const OVERCAST = { top: 0x6e7882, horizon: 0xa3abb1, haze: 0xaeb5ba, fog: 0xa0a8ae, cloud: 0x9aa2a9 };
const WIND = { x: 0.16, z: 0.07 }; // lean of the rain, as a fraction of its fall

/**
 * Tileable value noise, 16 lattice cells across a 64 px tile. The water shader
 * runs on every visible ground pixel, and on a phone that is most of the
 * screen: one bilinear fetch here replaces four hashes and three mixes per
 * octave, and the GPU mip-maps it for free at distance.
 */
function noiseTexture() {
  const CELLS = 16; const SIZE = 64;
  const lattice = new Float32Array(CELLS * CELLS);
  let seed = 9176;
  for (let i = 0; i < lattice.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; lattice[i] = seed / 4294967296; }
  const at = (x, y) => lattice[((y + CELLS) % CELLS) * CELLS + ((x + CELLS) % CELLS)];
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const fx = (x / SIZE) * CELLS; const fy = (y / SIZE) * CELLS;
    const ix = Math.floor(fx); const iy = Math.floor(fy);
    let tx = fx - ix; let ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const v = (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
    data.fill(Math.round(v * 255), (y * SIZE + x) * 4, (y * SIZE + x) * 4 + 3);
    data[(y * SIZE + x) * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

const noiseGlsl = /* glsl */`
  uniform sampler2D noiseMap;
  // One lattice cell of the tile is 1/16 of it: "metres per cell" in, noise out.
  float vnoise(vec2 p, float metresPerCell) { return texture2D(noiseMap, p / (metresPerCell * 16.0)).r; }
  float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  // Expanding rings where drops land: one drop per cell, each on its own clock.
  // Only ever evaluated close to the camera (see RIPPLE_REACH): past that a ring is under a pixel.
  float ripples(vec2 p, float time, float layers) {
    float sum = 0.0;
    for (int layer = 0; layer < 2; layer++) {
      if (float(layer) >= layers) break;
      vec2 q = p * (layer == 0 ? 1.0 : 1.7) + float(layer) * 17.3;
      vec2 cell = floor(q);
      float seed = hash21(cell + float(layer) * 3.1); // the only hash: position and clock are both spun out of it
      float age = fract(time * (0.7 + seed * 0.5) + seed * 7.0);
      vec2 centre = cell + 0.25 + 0.5 * fract(seed * vec2(13.7, 71.3));
      float d = length(q - centre);
      sum += (1.0 - smoothstep(0.0, 0.035, abs(d - age * 0.42))) * (1.0 - age);
    }
    return sum;
  }`;

function buildRain(uniforms) {
  const position = new Float32Array(DROPS * 2 * 3);
  const end = new Float32Array(DROPS * 2);
  for (let i = 0; i < DROPS; i++) {
    const x = Math.random(); const y = Math.random(); const z = Math.random();
    position.set([x, y, z, x, y, z], i * 6);
    end[i * 2] = 0; end[i * 2 + 1] = 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('tail', new THREE.BufferAttribute(end, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { time: uniforms.time, wet: uniforms.wet, eye: { value: new THREE.Vector3() }, box: { value: RAIN_BOX }, lean: { value: new THREE.Vector2(WIND.x, WIND.z) }, tint: uniforms.rainTint },
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute float tail;
      uniform float time; uniform vec3 eye; uniform vec3 box; uniform vec2 lean;
      varying float vAlpha;
      void main() {
        float speed = 19.0 + fract(position.x * 91.7) * 8.0; // m/s
        vec3 fall = vec3(lean.x, -1.0, lean.y) * speed;
        vec3 cell = position * box + fall * time;
        vec3 world = eye + mod(cell - eye + box * 0.5, box) - box * 0.5;
        world += normalize(fall) * tail * (0.7 + fract(position.z * 53.1) * 0.6);
        vec4 mvPosition = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vAlpha = (1.0 - tail * 0.75) * (1.0 - smoothstep(9.0, 24.0, -mvPosition.z));
      }`,
    fragmentShader: /* glsl */`
      uniform float wet; uniform vec3 tint;
      varying float vAlpha;
      void main() { gl_FragColor = vec4(tint, vAlpha * 0.72 * wet); }`,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = 'monsoon-rain'; lines.frustumCulled = false; lines.matrixAutoUpdate = false; lines.renderOrder = 6;
  return { lines, eye: material.uniforms.eye.value };
}

/** Shared by the wet sheet (puddles = noise mask) and the flood discs (puddles = everywhere). */
function waterMaterial(uniforms, flood) {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: uniforms.time, wet: uniforms.wet, skyTint: uniforms.skyTint, mud: { value: new THREE.Color(flood ? 0x6f6450 : 0x23262a) },
      fogColor: uniforms.fogColor, fogNear: uniforms.fogNear, fogFar: uniforms.fogFar,
      centre: { value: new THREE.Vector3() }, radius: { value: 1 },
      noiseMap: uniforms.noiseMap, rippleLayers: uniforms.rippleLayers, reach: uniforms.reach,
    },
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */`
      uniform float time; uniform float wet; uniform vec3 skyTint; uniform vec3 mud;
      uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
      uniform vec3 centre; uniform float radius; uniform float rippleLayers; uniform float reach;
      varying vec3 vWorld;
      #define RIPPLE_REACH 32.0
      ${noiseGlsl}
      void main() {
        vec3 toEye = cameraPosition - vWorld;
        float dist = length(toEye);
        float glance = 1.0 - clamp(toEye.y / dist, 0.0, 1.0);
        float grazing = glance * glance * glance * glance;
        float rings = 0.0;
        if (dist < RIPPLE_REACH && rippleLayers > 0.0) rings = ripples(vWorld.xz * 1.15, time, rippleLayers) * (1.0 - dist / RIPPLE_REACH);
        ${flood ? /* glsl */`
          // Standing water: opaque and muddy underfoot, all sky towards the horizon, fading out at the shore.
          float shore = 1.0 - smoothstep(radius * 0.72, radius, length(vWorld.xz - centre.xz) + (vnoise(vWorld.xz, 20.0) - 0.5) * 40.0);
          float swell = vnoise(vWorld.xz + time * 0.7, 2.9) * 0.12;
          vec3 colour = mix(mud, skyTint, clamp(grazing * 0.85 + swell + rings * 0.22, 0.0, 1.0));
          float alpha = shore * (0.8 + grazing * 0.2) * smoothstep(0.35, 0.8, wet);
        ` : /* glsl */`
          // Wet tarmac everywhere, puddles where the noise says the road dips.
          float pool = smoothstep(0.56, 0.68, vnoise(vWorld.xz, 6.25) * 0.7 + vnoise(vWorld.xz, 1.9) * 0.3);
          float edge = 1.0 - smoothstep(reach * 0.6, reach, length(vWorld.xz - centre.xz));
          vec3 colour = mix(mud, skyTint, clamp(grazing * (0.55 + pool * 0.45) + pool * (0.18 + rings * 0.5), 0.0, 1.0));
          float alpha = (0.3 + pool * 0.34 + grazing * 0.3) * edge * wet;
        `}
        float fog = smoothstep(fogNear, fogFar, dist);
        gl_FragColor = vec4(mix(colour, fogColor, fog), alpha * (1.0 - fog * 0.6));
      }`,
  });
}

function buildUmbrellas() {
  const canopy = new THREE.ConeGeometry(0.62, 0.24, 8, 1, true);
  canopy.translate(0, 2.12, 0);
  const shaft = new THREE.CylinderGeometry(0.012, 0.012, 0.9, 4);
  shaft.translate(0, 1.62, 0);
  const geometry = new THREE.BufferGeometry();
  // Merge by hand: both parts are small and share position/normal only.
  const parts = [canopy.toNonIndexed(), shaft.toNonIndexed()];
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const position = new Float32Array(total * 3); const normal = new Float32Array(total * 3);
  let at = 0;
  for (const g of parts) { position.set(g.attributes.position.array, at * 3); normal.set(g.attributes.normal.array, at * 3); at += g.attributes.position.count; }
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), UMBRELLAS);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const tint = new THREE.Color();
  for (let i = 0; i < UMBRELLAS; i++) mesh.setColorAt(i, tint.setHex(UMBRELLA_COLOURS[i % UMBRELLA_COLOURS.length]));
  mesh.name = 'monsoon-umbrellas'; mesh.frustumCulled = false; mesh.count = 0;
  return mesh;
}

function buildRainAudio() {
  let nodes = null;
  function ensure() {
    if (nodes) return nodes;
    const shared = getAudioContext();
    if (!shared) return null;
    const { ctx, master } = shared;
    const source = ctx.createBufferSource();
    source.buffer = whiteNoiseBuffer(ctx, 4); source.loop = true;
    const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 700;
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 7200;
    const gain = ctx.createGain(); gain.gain.value = 0;
    source.connect(high); high.connect(low); low.connect(gain); gain.connect(master);
    source.start();
    nodes = { ctx, master, gain, low };
    return nodes;
  }
  return {
    /** @param {number} wet 0..1 @param {boolean} sheltered under a roof: duller and quieter */
    set(wet, sheltered) {
      if (wet <= 0 && !nodes) return;
      const n = ensure();
      if (!n) return;
      n.gain.gain.setTargetAtTime(wet * (sheltered ? 0.035 : 0.085), n.ctx.currentTime, 0.4);
      n.low.frequency.setTargetAtTime(sheltered ? 1800 : 7200, n.ctx.currentTime, 0.4);
    },
    thunder() {
      const n = ensure();
      if (!n) return;
      const at = n.ctx.currentTime + 0.6 + Math.random() * 1.8; // light first, sound after
      const source = n.ctx.createBufferSource();
      source.buffer = whiteNoiseBuffer(n.ctx, 4);
      const filter = n.ctx.createBiquadFilter(); filter.type = 'lowpass';
      filter.frequency.setValueAtTime(220, at); filter.frequency.exponentialRampToValueAtTime(60, at + 3.5);
      const gain = n.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.55, at + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.2, at + 0.7);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 3.8);
      source.connect(filter); filter.connect(gain); gain.connect(n.master);
      source.start(at); source.stop(at + 4);
    },
  };
}

/**
 * @param {{ scene: THREE.Scene, sky: object, metro?: object, peds?: object, clutter?: object, motion?: object }} deps
 */
export function createMonsoon({ scene, sky, metro, peds, clutter, motion }) {
  const group = new THREE.Group(); group.name = 'monsoon'; group.visible = false;
  group.userData.cinematicIgnore = true; // src/cinematic-clearance.js: dressing, not an obstacle
  const uniforms = {
    time: { value: 0 }, wet: { value: 0 },
    skyTint: { value: new THREE.Color(OVERCAST.horizon) }, rainTint: { value: new THREE.Color(0xcfd8e0) },
    fogColor: { value: new THREE.Color(OVERCAST.fog) }, fogNear: { value: 100 }, fogFar: { value: 900 },
    noiseMap: { value: noiseTexture() }, rippleLayers: { value: 2 }, reach: { value: SHEET / 2 },
  };
  const rain = buildRain(uniforms);
  const sheetGeometry = new THREE.PlaneGeometry(SHEET, SHEET); sheetGeometry.rotateX(-Math.PI / 2);
  const sheet = new THREE.Mesh(sheetGeometry, waterMaterial(uniforms, false));
  sheet.name = 'monsoon-wet-ground'; sheet.frustumCulled = false; sheet.renderOrder = 3;
  const floodZones = FLOOD_STATIONS
    .map(([name, r]) => { const st = metro?.stations?.find((s) => s.name === name); return st ? { x: st.x, z: st.z, r } : null; })
    .filter(Boolean);
  const floods = floodZones.map((zone) => {
    const geometry = new THREE.CircleGeometry(zone.r * 1.2, 40); geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, waterMaterial(uniforms, true));
    mesh.position.set(zone.x, FLOOD_Y, zone.z); mesh.updateMatrix(); mesh.matrixAutoUpdate = false;
    mesh.material.uniforms.centre.value.set(zone.x, 0, zone.z); mesh.material.uniforms.radius.value = zone.r;
    mesh.name = 'monsoon-flood'; mesh.renderOrder = 4;
    return mesh;
  });
  const umbrellas = buildUmbrellas();
  group.add(sheet, ...floods, umbrellas, rain.lines);
  scene.add(group);
  const audio = buildRainAudio();

  let raining = false;
  let wet = 0;
  let graded = false;
  let flash = 0;
  let nextThunder = 14;
  let sheetAllowed = true;
  let umbrellaBudget = UMBRELLAS;
  let umbrellaEvery = 1; // frames between re-posing the umbrellas
  let frame = 0;
  const dummy = new THREE.Object3D();
  const base = new THREE.Color(); const grey = new THREE.Color();
  const mixHex = (hex, overcastHex, amount) => base.setHex(hex).lerp(grey.setHex(overcastHex), amount);

  /** Lay the overcast over sky.js's current preset. Reads the preset fresh each frame, so it never drifts. */
  function grade(amount) {
    const p = sky.preset;
    if (!p) return;
    const night = p.elevation < 0;
    const dim = night ? 0.45 : 1; // the grey has to darken with the day
    sky.uniforms.topColor.value.copy(mixHex(p.top, OVERCAST.top, amount * 0.92).multiplyScalar(1 - amount * (1 - dim)));
    sky.uniforms.horizonColor.value.copy(mixHex(p.horizon, OVERCAST.horizon, amount * 0.9).multiplyScalar(1 - amount * (1 - dim)));
    sky.uniforms.hazeColor.value.copy(mixHex(p.haze, OVERCAST.haze, amount * 0.9).multiplyScalar(1 - amount * (1 - dim)));
    sky.uniforms.sunIntensity.value = p.sunIntensity * (1 - amount * 0.92);
    sky.sun.intensity = p.dirIntensity * (1 - amount * 0.72) + flash * 2.2;
    sky.ambient.intensity = p.ambientIntensity * (1 - amount * 0.18) + flash * 1.4;
    scene.fog.color.copy(mixHex(p.fog, OVERCAST.fog, amount * 0.9).multiplyScalar(1 - amount * (1 - dim)));
    scene.fog.near *= 1 - amount * 0.55;
    scene.fog.far *= 1 - amount * 0.62;
    const materials = sky.clouds?.userData?.materials ?? [];
    materials.forEach((material, i) => {
      if (!material) return;
      material.color.copy(mixHex(p.cloudColor ?? 0xffffff, OVERCAST.cloud, amount).multiplyScalar(1 - amount * (1 - dim)));
      material.opacity = Math.min(1, (p.cloudOpacity ?? 0.82) * (i ? 0.55 : 1) + amount * 0.3);
    });
    uniforms.skyTint.value.copy(sky.uniforms.horizonColor.value).lerp(grey.setHex(0xffffff), 0.12 + flash * 0.5);
    uniforms.fogColor.value.copy(scene.fog.color);
    uniforms.fogNear.value = scene.fog.near; uniforms.fogFar.value = scene.fog.far;
    uniforms.rainTint.value.setHex(night ? 0x8d99a6 : 0xd5dde4);
  }

  function placeUmbrellas(viewPos) {
    let n = 0;
    for (const a of peds?.agents ?? []) {
      if (n >= umbrellaBudget) break;
      if (a._wx === undefined || a.dead || a.free || (a.y ?? 0) > 1) continue;
      if (Math.hypot(a._wx - viewPos.x, a._wz - viewPos.z) > UMBRELLA_RANGE) continue;
      if ((a._id ?? n) % 5 === 4) continue; // some people just get wet
      dummy.position.set(a._wx, 0, a._wz);
      dummy.rotation.set(0.1, (a._id ?? n) * 1.7, 0.06);
      dummy.scale.setScalar(a.scale ?? 1);
      dummy.updateMatrix();
      umbrellas.setMatrixAt(n++, dummy.matrix);
    }
    umbrellas.count = n;
    umbrellas.instanceMatrix.needsUpdate = true;
  }

  /**
   * Call AFTER sky.update(): the grade rescales the fog distances sky.js has just written.
   * @param {number} dt @param {number} elapsed
   * @param {{x: number, y: number, z: number}} viewPos
   * @param {boolean} [sheltered] inside a building or a train: no rain in the cabin, duller sound
   */
  function update(dt, elapsed, viewPos, sheltered = false) {
    wet += ((raining ? 1 : 0) - wet) * Math.min(1, dt * 0.45);
    if (!raining && wet < 0.004) wet = 0;
    if (wet === 0) {
      if (graded) { graded = false; group.visible = false; sky.setTime(sky.current); audio.set(0, false); }
      return;
    }
    graded = true;
    group.visible = true;
    uniforms.time.value = elapsed;
    uniforms.wet.value = wet;

    flash = Math.max(0, flash - dt * 3.2);
    nextThunder -= dt;
    if (raining && nextThunder <= 0) {
      nextThunder = 18 + Math.random() * 34;
      flash = 1;
      audio.thunder();
    }
    grade(wet);

    rain.eye.set(viewPos.x, viewPos.y, viewPos.z);
    rain.lines.visible = !sheltered;
    sheet.visible = sheetAllowed;
    sheet.position.set(Math.round(viewPos.x), SHEET_Y, Math.round(viewPos.z));
    sheet.material.uniforms.centre.value.copy(sheet.position);
    for (const mesh of floods) mesh.visible = Math.hypot(mesh.position.x - viewPos.x, mesh.position.z - viewPos.z) < mesh.material.uniforms.radius.value * 1.2 + 900;

    if (wet <= 0.35) umbrellas.count = 0;
    else if (frame++ % umbrellaEvery === 0) placeUmbrellas(viewPos);
    audio.set(wet, sheltered);
  }

  function set(on) {
    if (raining === on) return raining;
    raining = on;
    if (on) nextThunder = 6 + Math.random() * 8;
    clutter?.setWind?.(on ? 2.4 : 1);
    motion?.setRain?.(on, floodZones);
    return raining;
  }

  /**
   * low: 40% of the drops, one ripple layer, a wet sheet that reaches 110 m
   * instead of 180, fewer umbrellas re-posed every other frame.
   * @param {'high' | 'low' | 'minimal'} tier
   */
  function setQuality(tier) {
    const low = tier !== 'high';
    // minimal: the machine is over budget even at the governor's floor. The wet
    // sheet is an alpha layer over every ground pixel, so it is what goes; the
    // overcast grade, the rain and the flood water still say "monsoon".
    sheetAllowed = tier !== 'minimal';
    rain.lines.geometry.setDrawRange(0, Math.round(DROPS * (tier === 'minimal' ? 0.25 : low ? 0.4 : 1)) * 2);
    uniforms.rippleLayers.value = tier === 'minimal' ? 0 : low ? 1 : 2;
    uniforms.reach.value = (SHEET / 2) * (low ? 0.6 : 1);
    sheet.scale.setScalar(low ? 0.62 : 1);
    umbrellaBudget = low ? 18 : UMBRELLAS;
    umbrellaEvery = low ? 2 : 1;
  }

  return {
    group,
    update,
    set,
    setQuality,
    toggle: () => set(!raining),
    get raining() { return raining; },
    get wet() { return wet; },
    floodZones,
  };
}
