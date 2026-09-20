/**
 * night.js
 *
 * Everything that turns on after dusk: streetlight glow and ground pools,
 * lit shop signs, lit apartment windows (driven through city.js's wall
 * material), vehicle head/taillights, and a soft glow on the metro stations.
 *
 * Discovery of the streetlight/sign/metro geometry is done defensively by
 * walking the scene graph by object name and material heuristics rather than
 * importing from streets.js / signs.js / metro.js directly, because those
 * three files are being edited concurrently by another pass. Every lookup is
 * wrapped so a missing or reshaped group degrades gracefully instead of
 * throwing.
 *
 * Performance note: the spec sketch describes per-lamp THREE.Sprite objects,
 * but a Dhaka arterial corridor here carries several hundred streetlights —
 * one draw call per Sprite would blow the frame budget. Instead the glow and
 * ground pools are each a single batched draw call (a THREE.Points cloud for
 * the head glow, one InstancedMesh for the ground pools), which reads the
 * same visually but costs about as much as two extra sprites.
 */

import * as THREE from 'three';

// P11-O retune (2026-09-07): the 24 dynamic THREE.PointLights were removed
// here. The advisor isolated their contribution live: with the ground pools
// hidden and the lights pushed all the way to intensity 30 / distance 26,
// the lit patch on the road disappeared completely — every bit of visible
// road lighting was coming from the additive pool circles (poolMesh) and
// the head-glow sprites (glowPoints), not from the real lights. As shipped
// by P11-L (7 / 16) they were dimmer than that ceiling, so they were full
// per-fragment cost for zero visible benefit: 24 forward-lit PointLights is
// real cost on a scene already drawing ~30k buildings (each affected
// fragment in range re-evaluates lighting per light). Cutting them entirely
// gives those frames back with no visible loss, since the pools + glow
// sprites already carry the whole look. See docs/HANDOFF.md for the
// measured FPS delta.
const LIGHT_COLOR = 0xffb256;

const FADE_RATE = 0.6; // factor units per second, so "t" transitions ease

/** Small radial-gradient sprite texture, white centre fading to transparent. */
function makeGlowTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Find every streetlight lamp-head/crossarm InstancedMesh inside
 * 'street-furniture' by geometry bounding-box size, rather than by child
 * index or name, since streets.js may be mid-edit.
 *
 * streets.js bakes each lamp's height into the geometry itself (a
 * `geometry.translate(x, y, z)` applied before the per-instance transform),
 * not into the instance matrix — so `setFromMatrixPosition` on an instance
 * matrix always returns y=0 for the pivot. A Y-axis-only instance rotation
 * (which is all these poles use) never changes a point's Y, so the true
 * world head height is recovered by adding the geometry's own bounding-box
 * *centre* Y (read from the geometry, never hardcoded, so this survives any
 * future change to the baked height in streets.js) to the XZ position
 * `setFromMatrixPosition` already gets right.
 *
 * Two lamp families live under 'street-furniture' (see
 * docs/briefs/P11-L-NIGHT-STREETLIGHTS.md and the P11-O correction in
 * docs/HANDOFF.md):
 *  - cobra-head streetlights (pole + arm + head, head box ~0.72x0.2x0.34 @
 *    y~8.9, 2716 instances) — the head is the actual lamp fixture. Only
 *    this family is lit.
 *  - plain utility/power poles (pole + crossarm, crossarm box
 *    ~1.5x0.1x0.1 @ y~7.6, 5766 instances) — reading streets.js (not just
 *    its bounding-box size, which is how P11-L's brief misidentified it)
 *    confirms this is a bare power-pole crossarm with no luminaire at all.
 *    Lighting it means glowing the crossarm/cable support, not a lamp, so
 *    it is deliberately excluded below.
 * Both families' arm/head boxes are compact and wider-than-tall, unlike the
 * pole-shaft cylinders (thin, many metres tall), so the shafts are already
 * excluded by the y window. The x/z window is additionally narrowed to
 * admit only the cobra-head's head box (0.72 x 0.2 x 0.34) and reject its
 * own arm (1.9 x 0.11 x 0.11) and the utility crossarm (1.5 x 0.1 x 0.1):
 * x must stay under 1.2 (excludes both 1.9 and 1.5 wide arms) and z over
 * 0.2 (excludes both 0.11 and 0.1 thin arms). There are only 5
 * InstancedMeshes under 'street-furniture' in total (2 pole shafts + 3
 * arm/head boxes), so this can't accidentally pull in benches/bollards/
 * signboards — none live in this group.
 */
function findLampWorldPositions(scene3) {
  const positions = [];
  try {
    const furniture = scene3.getObjectByName('street-furniture');
    if (!furniture) return positions;
    furniture.updateMatrixWorld(true);

    const lampMeshes = [];
    furniture.traverse((obj) => {
      if (!obj.isInstancedMesh) return;
      const geo = obj.geometry;
      if (!geo || !geo.attributes || !geo.attributes.position) return;
      if (!geo.boundingBox) geo.computeBoundingBox();
      const size = new THREE.Vector3();
      geo.boundingBox.getSize(size);
      // Cobra-head lamp head only: compact, wider than tall/deep (rules
      // out the ~9 m pole shafts), x < 1.2 (rules out both arms, 1.9 and
      // 1.5 m long) and z > 0.2 (rules out both arms, 0.11 and 0.1 m
      // thick) — isolates the 0.72 x 0.2 x 0.34 head box from everything
      // else under 'street-furniture'. See the function doc comment.
      if (size.x > 0.4 && size.x < 1.2 && size.y > 0.08 && size.y < 0.4 && size.z > 0.2 && size.z < 0.6) {
        const center = new THREE.Vector3();
        geo.boundingBox.getCenter(center);
        lampMeshes.push({ mesh: obj, headY: center.y });
      }
    });
    if (!lampMeshes.length) return positions;

    const m = new THREE.Matrix4();
    for (const { mesh, headY } of lampMeshes) {
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m);
        m.premultiply(mesh.matrixWorld);
        const v = new THREE.Vector3().setFromMatrixPosition(m);
        v.y += headY;
        positions.push(v);
      }
    }
  } catch (err) {
    console.warn('night: streetlight discovery failed', err);
  }
  return positions;
}

/** Find the shop signboards mesh and cache its material for glow control. */
function findSignMaterial(scene3) {
  try {
    const signs = scene3.getObjectByName('shop-signs');
    if (!signs) return null;
    const board = signs.getObjectByName('signboards');
    return board ? board.material : null;
  } catch (err) {
    console.warn('night: sign discovery failed', err);
    return null;
  }
}

/**
 * Find near-white ("canopy") materials under 'metro' by colour heuristic, and
 * platform-length station groups to scatter cool-white sprites along.
 */
function findMetroTargets(scene3) {
  const materials = new Set();
  const stationBoxes = [];
  try {
    const metro = scene3.getObjectByName('metro');
    if (!metro) return { materials, stationBoxes };
    metro.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          // Unlit materials have no emissive shader uniform.
          if (!mat.color || !mat.emissive) continue;
          const { r, g, b } = mat.color;
          if (r > 0.78 && g > 0.78 && b > 0.75) materials.add(mat);
        }
      }
      if (obj.name && obj.name.startsWith('station:')) {
        const box = new THREE.Box3().setFromObject(obj);
        if (isFinite(box.min.x)) stationBoxes.push(box);
      }
    });
  } catch (err) {
    console.warn('night: metro discovery failed', err);
  }
  return { materials, stationBoxes };
}

/**
 * @param {THREE.Scene} scene3
 * @param {import('./sky.js').Sky} sky
 * @param {{ wallMaterial?: THREE.Material, traffic?: { setNight: (b:boolean)=>void } }} groups
 * @returns {{ update: (playerPos: THREE.Vector3, dt: number) => void }}
 */
export function createNight(scene3, sky, groups = {}) {
  const glowTex = makeGlowTexture();

  // --- Streetlights: pools + head glow, batched into single draw calls -----
  const lampPositions = findLampWorldPositions(scene3);

  let poolMesh = null;
  let poolMat = null;
  if (lampPositions.length) {
    // P11-L retune: was radius 7. Since only the 2716 cobra-heads are lit
    // now (see findLampWorldPositions doc comment) lamp spacing is wider
    // than it was with the utility-pole family mixed in, so 5 m keeps a
    // clear dark gap between neighbouring pools without them merging into
    // a lit strip.
    const poolGeo = new THREE.CircleGeometry(5, 20);
    poolGeo.rotateX(-Math.PI / 2);
    poolMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      color: LIGHT_COLOR,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    poolMesh = new THREE.InstancedMesh(poolGeo, poolMat, lampPositions.length);
    poolMesh.name = 'night-light-pools';
    poolMesh.frustumCulled = false;
    const dummy = new THREE.Object3D();
    // P11-O retune: was y=0.05, which sits under every road/paving surface
    // in streets.js's Y stacking table (Y.footpath 0.06, Y.service 0.08,
    // Y.minor 0.1, Y.major 0.12, Y.marking 0.145, Y.median 0.16) so the
    // pools were fully hidden and contributed nothing. 0.25 clears all of
    // those (the smallest surface margin is ~0.09 m, above Y.median) while
    // staying below the 0.27 m kerb-top (Y.major + 0.15 m kerb height) that
    // runs along arterial roads, so the pool doesn't visibly float past the
    // kerb edge at a low, street-level viewing angle. Confirmed live.
    const POOL_Y = 0.25;
    lampPositions.forEach((p, i) => {
      dummy.position.set(p.x, POOL_Y, p.z);
      dummy.updateMatrix();
      poolMesh.setMatrixAt(i, dummy.matrix);
    });
    poolMesh.instanceMatrix.needsUpdate = true;
    scene3.add(poolMesh);
  }

  let glowPoints = null;
  let glowMat = null;
  if (lampPositions.length) {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(lampPositions.length * 3);
    lampPositions.forEach((p, i) => {
      arr[i * 3] = p.x;
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = p.z;
    });
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    glowMat = new THREE.PointsMaterial({
      map: glowTex,
      color: LIGHT_COLOR,
      // P11-O retune: was 16 (before that, 34). PointsMaterial with
      // sizeAttenuation:true measures `size` in world metres, not pixels,
      // so 16 rendered as a 16 m ball of light per lamp — at real head
      // height these overlapped into floating orbs, worse than the
      // original bug. 2.6 confirmed live: a tidy halo per head that reads
      // as a lit lamp; anything above ~4 starts blooming into neighbours.
      size: 2.6,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    glowPoints = new THREE.Points(geo, glowMat);
    glowPoints.name = 'night-lamp-glow';
    glowPoints.frustumCulled = false;
    scene3.add(glowPoints);
  }

  // --- Shop signs ------------------------------------------------------------
  const signMaterial = findSignMaterial(scene3);
  if (signMaterial?.emissive) {
    signMaterial.emissiveMap = signMaterial.map;
    signMaterial.emissive = new THREE.Color(0xffffff);
    signMaterial.emissiveIntensity = 0;
    // Assigning emissiveMap after the material compiled needs a recompile,
    // otherwise three.js reads a stale uniform table and throws every
    // frame ("Cannot read properties of undefined (reading 'value')").
    signMaterial.needsUpdate = true;
  }

  // --- Metro glow --------------------------------------------------------
  const { materials: metroMaterials, stationBoxes } = findMetroTargets(scene3);
  for (const mat of metroMaterials) {
    mat.emissive = new THREE.Color(0xd8e6dc);
    mat.emissiveIntensity = 0;
  }

  const platformSprites = [];
  try {
    const spriteMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xeaf3ee,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (const box of stationBoxes) {
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);
      const longAxis = size.x >= size.z ? 'x' : 'z';
      const length = longAxis === 'x' ? size.x : size.z;
      const n = Math.max(2, Math.round(length / 18));
      const y = box.max.y - 1.0;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.setScalar(2.2);
        if (longAxis === 'x') {
          sprite.position.set(box.min.x + size.x * t, y, center.z);
        } else {
          sprite.position.set(center.x, y, box.min.z + size.z * t);
        }
        scene3.add(sprite);
        platformSprites.push(sprite);
      }
    }
  } catch (err) {
    console.warn('night: metro platform sprites failed', err);
  }

  // --- Driver --------------------------------------------------------------
  let factor = 0;

  function update(playerPos, dt) {
    const target = sky.preset && sky.preset.elevation < 0.16 ? 1 : 0;
    if (factor < target) factor = Math.min(target, factor + FADE_RATE * dt);
    else if (factor > target) factor = Math.max(target, factor - FADE_RATE * dt);

    if (poolMat) poolMat.opacity = 0.45 * factor;
    if (glowMat) glowMat.opacity = factor;
    if (signMaterial) signMaterial.emissiveIntensity = 0.9 * factor;
    for (const mat of metroMaterials) mat.emissiveIntensity = 0.35 * factor;
    for (const sprite of platformSprites) sprite.material.opacity = 0.8 * factor;
    if (groups.wallMaterial && groups.wallMaterial.setNightIntensity) {
      groups.wallMaterial.setNightIntensity(factor);
    }
    if (groups.traffic && groups.traffic.setNight) {
      groups.traffic.setNight(factor > 0.5);
    }
  }

  return { update };
}
