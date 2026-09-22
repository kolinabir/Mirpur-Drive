/**
 * avatar.js (P5-TPS)
 *
 * The third-person player avatar: a small procedural figure built the same
 * way as the pedestrians in src/traffic.js (capsule torso, sphere head) but
 * with separate instanced legs and arms so a walk cycle can drive them.
 * Hidden entirely in first person — player.js only calls setVisible(true)
 * while its camera boom is in third-person mode — and always positioned at
 * (x, feetY, z), never a constant, so it stands correctly on the station
 * stairs/landings/platform that src/interior.js provides.
 *
 * Draw calls: 3 — one merged, vertex-coloured torso+head mesh, one
 * InstancedMesh for the two legs, one InstancedMesh for the two arms.
 * Triangle count is reported on the returned `stats` object; see
 * docs/TPS-PASS.md for the measured figure.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Body proportions, metres above the feet (player.feetY).
export const SHOULDER_HEIGHT = 1.4; // camera boom pivot in player.js reuses this
const HIP_Y = 0.85;
const HEAD_Y = 1.62;
const LEG_LEN = 0.85; // hip to feet
const ARM_LEN = 0.62; // shoulder to hand
const LEG_RADIUS = 0.11;
const ARM_RADIUS = 0.085;
const HIP_OFFSET = 0.12; // half hip width
const SHOULDER_OFFSET = 0.24; // half shoulder width
const HEAD_RADIUS = 0.13;
const TORSO_RADIUS = 0.17;

const MAX_LEG_SWING = 0.62; // rad, full running stride
const MAX_ARM_SWING = 0.5;
const IDLE_SWAY = 0.05; // rad, gentle idle arm sway when stopped
const FACING_SMOOTH = 8; // 1/s, how fast the avatar turns toward travel dir
// Melee swing peaks (street-fight.js): the right arm throws a punch, the right
// leg a kick, from the same pivots the walk cycle already uses.
const PUNCH_SWING = 1.5; // rad forward at the peak
const KICK_SWING = 1.0;

const SHIRT_COLOR = new THREE.Color(0x3f5f8c);
const SKIN_COLOR = new THREE.Color(0x8a6a4f);
const PANTS_COLOR = 0x33363c;

function lerpAngle(a, b, t) {
  const diff = (((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + diff * t;
}

function triCount(geo) {
  return (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
}

/** Merged torso + head, vertex-coloured so both stay a single draw call. */
function buildTorso() {
  const torsoCylinder = Math.max(0.02, SHOULDER_HEIGHT - HIP_Y - 2 * TORSO_RADIUS);
  const torso = new THREE.CapsuleGeometry(TORSO_RADIUS, torsoCylinder, 3, 8);
  torso.translate(0, HIP_Y + (SHOULDER_HEIGHT - HIP_Y) / 2, 0);
  const head = new THREE.SphereGeometry(HEAD_RADIUS, 8, 6);
  head.translate(0, HEAD_Y, 0);

  const torsoCount = torso.attributes.position.count;
  const headCount = head.attributes.position.count;
  const colors = new Float32Array((torsoCount + headCount) * 3);
  for (let i = 0; i < torsoCount; i++) SHIRT_COLOR.toArray(colors, i * 3);
  for (let i = 0; i < headCount; i++) SKIN_COLOR.toArray(colors, (torsoCount + i) * 3);

  const merged = mergeGeometries([torso, head], false);
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const tris = triCount(torso) + triCount(head);
  torso.dispose();
  head.dispose();

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return { mesh, tris };
}

/** One InstancedMesh (2 instances) for a pair of limbs, pivoting from the top. */
function buildLimbPair(length, radius, color) {
  const cyl = Math.max(0.02, length - 2 * radius);
  const geo = new THREE.CapsuleGeometry(radius, cyl, 2, 6);
  // Origin at the attachment point (hip/shoulder); the limb hangs down from
  // it so rotating the instance about its own origin swings it from there.
  geo.translate(0, -length / 2, 0);
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.InstancedMesh(geo, mat, 2);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return { mesh, tris: triCount(geo) * 2 };
}

export function createAvatar() {
  const group = new THREE.Group();
  group.name = 'playerAvatar';
  group.visible = false;

  const { mesh: torso, tris: torsoTris } = buildTorso();
  const { mesh: legs, tris: legTris } = buildLimbPair(LEG_LEN, LEG_RADIUS, PANTS_COLOR);
  const { mesh: arms, tris: armTris } = buildLimbPair(ARM_LEN, ARM_RADIUS, SHIRT_COLOR.getHex());
  group.add(torso, legs, arms);

  const dummy = new THREE.Object3D();
  let phase = 0;
  let facingYaw = 0;
  let attached = false;

  function setInstance(mesh, index, x, y, angle) {
    dummy.position.set(x, y, 0);
    dummy.rotation.set(angle, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }

  return {
    group,

    /** Add the avatar group to a scene exactly once (idempotent). */
    addedTo(scene) {
      if (attached || !scene) return;
      scene.add(group);
      attached = true;
    },

    setVisible(v) {
      group.visible = v;
    },

    /**
     * @param dt seconds
     * @param opts.x, opts.z world position (metres)
     * @param opts.feetY the surface height the player stands on
     * @param opts.speed horizontal ground speed, m/s
     * @param opts.running true while sprinting (Shift)
     * @param opts.movingYaw direction of travel (radians), or null when idle
     * @param opts.swing street-fight.js's swing ({ kind, t }) or null: poses
     *   the right arm/leg over the walk cycle for the third-person punch/kick
     */
    update(dt, { x, z, feetY, speed, running, movingYaw, swing }) {
      group.position.set(x, feetY, z);

      const moving = speed > 0.15;
      if (moving && movingYaw != null) {
        facingYaw = lerpAngle(facingYaw, movingYaw, Math.min(1, dt * FACING_SMOOTH));
      }
      group.rotation.y = facingYaw;

      if (moving) {
        const runFrac = running ? 1 : 0.62;
        phase += dt * speed * 3.4;
        const legSwing = MAX_LEG_SWING * runFrac;
        const armSwing = MAX_ARM_SWING * runFrac;
        setInstance(legs, 0, -HIP_OFFSET, HIP_Y, Math.sin(phase) * legSwing);
        setInstance(legs, 1, HIP_OFFSET, HIP_Y, Math.sin(phase + Math.PI) * legSwing);
        setInstance(arms, 0, -SHOULDER_OFFSET, SHOULDER_HEIGHT, Math.sin(phase + Math.PI) * armSwing);
        setInstance(arms, 1, SHOULDER_OFFSET, SHOULDER_HEIGHT, Math.sin(phase) * armSwing);
      } else {
        phase += dt * 0.7;
        setInstance(legs, 0, -HIP_OFFSET, HIP_Y, 0);
        setInstance(legs, 1, HIP_OFFSET, HIP_Y, 0);
        setInstance(arms, 0, -SHOULDER_OFFSET, SHOULDER_HEIGHT, Math.sin(phase) * IDLE_SWAY);
        setInstance(arms, 1, SHOULDER_OFFSET, SHOULDER_HEIGHT, Math.sin(phase + Math.PI) * IDLE_SWAY);
      }
      // Melee swing (street-fight.js, forwarded by player.js): applied AFTER
      // the walk/idle pose so it wins for those few frames. Index 1 is +X —
      // the right-hand side of a figure whose local forward is -Z.
      if (swing) {
        const k = Math.sin(Math.PI * Math.min(1, Math.max(0, swing.t))); // 0 -> 1 -> 0
        if (swing.kind === 'kick') setInstance(legs, 1, HIP_OFFSET, HIP_Y, KICK_SWING * k);
        else setInstance(arms, 1, SHOULDER_OFFSET, SHOULDER_HEIGHT, PUNCH_SWING * k);
      }
      legs.instanceMatrix.needsUpdate = true;
      arms.instanceMatrix.needsUpdate = true;
    },

    stats: {
      drawCalls: 3,
      triangles: Math.round(torsoTris + legTris + armTris),
    },
  };
}
