/**
 * hit-fx.js
 *
 * The visible aftermath of traffic.js's run-over physics: blood droplets that
 * fly off an impact, blood decals on the road (pools under a body, streaks
 * where one slid, specks where droplets landed) and the shout bubbles over
 * pedestrians who got back up.
 *
 * Everything is a fixed-size ring-buffer pool built once: two InstancedMeshes
 * (droplets, decals = two draw calls, zero while empty) and a handful of
 * sprites. Spawning overwrites the oldest slot, so a long rampage costs
 * exactly what a short one does, and update() returns immediately while
 * nothing is alive.
 */
import * as THREE from 'three';

const DROPLET_CAP = 48;
const DECAL_CAP = 64;
const BUBBLE_CAP = 4;
const DECAL_LIFE = 45; // s
const DECAL_FADE = 3; // s at the end of its life spent shrinking away
const DECAL_Y = 0.045; // m above the road, plus polygonOffset, against z-fighting
const GRAVITY = 16; // matches traffic.js's ragdolls
const BLOOD = 0x7a0c0c;

export function createHitFx() {
  const group = new THREE.Group();
  group.name = 'hit-fx';
  const dummy = new THREE.Object3D();
  let bloodOn = true;

  // ---- Droplets ----------------------------------------------------------
  const dropMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.045, 0),
    new THREE.MeshBasicMaterial({ color: BLOOD }),
    DROPLET_CAP,
  );
  dropMesh.name = 'hit-fx:droplets';
  dropMesh.frustumCulled = false;
  dropMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dropMesh.visible = false;
  group.add(dropMesh);
  const drops = [];
  for (let i = 0; i < DROPLET_CAP; i++) drops.push({ live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
  let dropNext = 0;
  let dropsLive = 0;

  // ---- Decals ------------------------------------------------------------
  const decalGeo = new THREE.CircleGeometry(1, 14);
  decalGeo.rotateX(-Math.PI / 2);
  const decalMesh = new THREE.InstancedMesh(
    decalGeo,
    new THREE.MeshBasicMaterial({
      color: BLOOD, transparent: true, opacity: 0.88, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }),
    DECAL_CAP,
  );
  decalMesh.name = 'hit-fx:decals';
  decalMesh.frustumCulled = false;
  decalMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  decalMesh.renderOrder = 2;
  decalMesh.visible = false;
  group.add(decalMesh);
  const decals = [];
  for (let i = 0; i < DECAL_CAP; i++) {
    decals.push({ live: false, x: 0, z: 0, size: 0, grow: 0, age: 0, yaw: 0, stretch: 1 });
  }
  let decalNext = 0;
  let decalsLive = 0;
  // A decal that is neither growing nor fading does not need its matrix rewritten.
  let decalsDirty = false;

  function writeDecal(i) {
    const d = decals[i];
    let s = 0;
    if (d.live) {
      const grown = d.grow > 0 ? Math.min(1, d.age / d.grow) : 1;
      const left = DECAL_LIFE - d.age;
      s = d.size * (0.25 + 0.75 * grown) * (left < DECAL_FADE ? Math.max(0, left / DECAL_FADE) : 1);
    }
    dummy.position.set(d.x, DECAL_Y, d.z);
    dummy.rotation.set(0, d.yaw, 0);
    dummy.scale.set(s, 1, s * d.stretch);
    dummy.updateMatrix();
    decalMesh.setMatrixAt(i, dummy.matrix);
    decalsDirty = true;
  }
  for (let i = 0; i < DECAL_CAP; i++) writeDecal(i);

  /**
   * @param {number} x @param {number} z @param {number} size final radius, m
   * @param {number} [grow] s taken to spread to that size (a pool); 0 = instant
   * @param {number} [yaw] @param {number} [stretch] length/width, for a streak
   */
  function splat(x, z, size, grow = 0, yaw = 0, stretch = 1) {
    if (!bloodOn) return;
    const d = decals[decalNext];
    if (!d.live) decalsLive++;
    d.live = true;
    d.x = x;
    d.z = z;
    d.size = size;
    d.grow = grow;
    d.age = 0;
    d.yaw = yaw;
    d.stretch = stretch;
    writeDecal(decalNext);
    decalNext = (decalNext + 1) % DECAL_CAP;
    decalMesh.visible = true;
  }

  /** Spray `n` droplets from (x, y, z), carried along by velocity (vx, vz). */
  function burst(x, y, z, vx, vz, n) {
    if (!bloodOn) return;
    for (let k = 0; k < n; k++) {
      const p = drops[dropNext];
      dropNext = (dropNext + 1) % DROPLET_CAP;
      if (!p.live) dropsLive++;
      p.live = true;
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = vx * (0.3 + Math.random() * 0.5) + (Math.random() - 0.5) * 4;
      p.vy = 1.5 + Math.random() * 4;
      p.vz = vz * (0.3 + Math.random() * 0.5) + (Math.random() - 0.5) * 4;
    }
    dropMesh.visible = true;
  }

  // ---- Shout bubbles -----------------------------------------------------
  const bubbles = [];
  for (let i = 0; i < BUBBLE_CAP; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    sprite.scale.set(4, 0.8, 1);
    sprite.visible = false;
    sprite.renderOrder = 5;
    group.add(sprite);
    bubbles.push({ sprite, canvas, texture, follow: null, left: 0 });
  }
  let bubbleNext = 0;

  function drawBubble(b, text) {
    const ctx = b.canvas.getContext('2d');
    const { width: w, height: h } = b.canvas;
    ctx.clearRect(0, 0, w, h);
    ctx.font = '600 40px "Noto Sans Bengali", "Hind Siliguri", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = Math.min(w - 40, ctx.measureText(text).width);
    const bw = tw + 48;
    const x0 = (w - bw) / 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.beginPath();
    ctx.roundRect(x0, 14, bw, 84, 26);
    ctx.fill();
    ctx.beginPath(); // tail
    ctx.moveTo(w / 2 - 14, 96);
    ctx.lineTo(w / 2, 124);
    ctx.lineTo(w / 2 + 14, 96);
    ctx.fill();
    ctx.fillStyle = '#1a1a1e';
    ctx.fillText(text, w / 2, 58, w - 40);
    b.texture.needsUpdate = true;
  }

  /**
   * Show `text` over `follow` for `secs`. `follow` is any object carrying
   * live world coordinates in `.bx/.by/.bz` (traffic.js's agents); saying
   * something new replaces whatever that same speaker was saying.
   */
  function say(follow, text, secs = 2.4) {
    let b = bubbles.find((o) => o.follow === follow);
    if (!b) {
      b = bubbles[bubbleNext];
      bubbleNext = (bubbleNext + 1) % BUBBLE_CAP;
    }
    b.follow = follow;
    b.left = secs;
    drawBubble(b, text);
    b.sprite.visible = true;
  }

  function update(dt) {
    if (dropsLive) {
      for (let i = 0; i < DROPLET_CAP; i++) {
        const p = drops[i];
        if (p.live) {
          p.vy -= GRAVITY * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          if (p.y <= 0.03) {
            p.live = false;
            dropsLive--;
            if (Math.random() < 0.6) splat(p.x, p.z, 0.06 + Math.random() * 0.12);
          }
        }
        const s = p.live ? 1 : 0;
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        dropMesh.setMatrixAt(i, dummy.matrix);
      }
      dropMesh.instanceMatrix.needsUpdate = true;
      if (!dropsLive) dropMesh.visible = false;
    }

    if (decalsLive) {
      for (let i = 0; i < DECAL_CAP; i++) {
        const d = decals[i];
        if (!d.live) continue;
        d.age += dt;
        if (d.age >= DECAL_LIFE) {
          d.live = false;
          decalsLive--;
          writeDecal(i);
        } else if (d.age < d.grow + dt || DECAL_LIFE - d.age < DECAL_FADE) {
          writeDecal(i);
        }
      }
      if (!decalsLive) decalMesh.visible = false;
    }
    if (decalsDirty) {
      decalMesh.instanceMatrix.needsUpdate = true;
      decalsDirty = false;
    }

    for (const b of bubbles) {
      if (!b.follow) continue;
      b.left -= dt;
      if (b.left <= 0) {
        b.follow = null;
        b.sprite.visible = false;
        continue;
      }
      b.sprite.position.set(b.follow.bx, b.follow.by + 0.55, b.follow.bz);
      b.sprite.material.opacity = Math.min(1, b.left / 0.35);
    }
  }

  return {
    group,
    burst,
    splat,
    say,
    update,
    /** Settings > Blood. Off stops new blood and clears what is on the road. */
    setBlood(on) {
      bloodOn = on;
      if (on) return;
      for (const p of drops) p.live = false;
      dropsLive = 0;
      dropMesh.visible = false;
      for (let i = 0; i < DECAL_CAP; i++) {
        decals[i].live = false;
        writeDecal(i);
      }
      decalsLive = 0;
      decalMesh.visible = false;
    },
  };
}
