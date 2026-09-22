/**
 * street-fight.js
 *
 * On-foot melee and robbery. Q throws a punch; keep it held and the same
 * wind-up becomes a kick. A pedestrian on the ground can be robbed with R —
 * its own key, deliberately NOT E: E already means "interact" (hail a ride,
 * cha, gates, board a train), and overloading it would make walking past a
 * cha stall next to a body ambiguous. R was chosen knowing exactly where else
 * it is used: drive.js reads it for look-behind (driving only) and the full
 * map for recenter (map open only) — both are modes where canFight() is
 * already false — and this module never calls preventDefault(), so neither
 * owner ever loses the key. Robbery is not in main.js's interactWithWorld()
 * chain for the same reason: E must stay unambiguous.
 * Left-click punches too, but only while the pointer is locked: the click
 * that ASKS for the lock must never swing.
 *
 * The swing is animated in both views: a first-person fist/boot placed from
 * the view basis (2 draw calls while a ~0.3 s swing plays, 0 otherwise) with
 * a small camera recoil, and in third person the avatar's own right arm/leg
 * (player.js forwards this module's swing state into avatar.update). On
 * touch there is no R key, so the Interact button picks robbery up and the
 * prompt's keycap switches to E to match.
 *
 * Why this is a separate module
 * -----------------------------
 * The crowd owns the people; this owns the player's intent. A hit needs one
 * thing from traffic.js — the additive `strike()` export — and everything
 * after it (ragdoll, blood, panic, get-up, shouts) is the machinery the game
 * already ships for run-overs, drawn by pools hit-fx.js already owns. So the
 * Settings > Blood switch and the MAX_RAGDOLLS cap apply unchanged, and this
 * file adds no draw call, no texture, no instance and no dependency. The
 * sounds are WebAudio one-shots on the app's one shared context (audio.js),
 * created on the keypress — the same "one context" rule drive.js follows.
 *
 * Cost
 * ----
 * Event-driven only, which is why the perf checklist's two knobs are wired
 * but deliberately empty (see setDetailScale/setQuality at the bottom). A
 * punch scans the ~750-agent array once, on the press; the rob prompt
 * refreshes at 4 Hz (streetlife's own slowTimer cadence) and costs one
 * distance check per agent until somebody is actually down. Nothing here is
 * per-frame, per-pixel or per-agent-per-frame.
 *
 * Tone boundary (CONTRIBUTING.md, "Conduct")
 * ------------------------------------------
 * Targets are the anonymous procedural crowd and nothing else — never a named
 * shop, sign, station or landmark — so the real businesses the project models
 * sign-for-sign are not robbery targets. Melee is non-lethal by construction:
 * strike() is only ever passed the 'flee' and 'limp' fates, never 'dead', so
 * the worst a fist or a boot does is put someone on the ground for a few
 * seconds; blood is the hard-kick case only and obeys the existing Blood
 * setting. Being seen costs notoriety, and witnesses bolt — the street
 * notices, it does not applaud.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ensureAudioContext, whiteNoiseBuffer } from './audio.js';
import { tr } from './i18n.js';

const PUNCH_RANGE = 1.9; // m: an arm plus a little reach
const KICK_RANGE = 2.3; // m: the boot lands further than the fist
const PUNCH_CD = 0.34; // s between punches: a jab, not a machine gun
const KICK_CD = 0.9; // s to recover from a kick
const KICK_HOLD = 0.45; // s the key stays down before the wind-up becomes a kick
const CONE = 0.35; // dot(facing, to-target) floor: a ~140-degree swing, as generous as a fist
const PUNCH_POWER = 0.35; // 0..1, handed to traffic.js#strike (fate 'flee')
const KICK_POWER = 0.85; // hard: fate 'limp', panic nearby, a little blood
const ROBBABLE_RANGE = 2.1; // m from a downed body
const ROB_SCAN = 0.25; // s between prompt scans (4 Hz)
const NOTORIETY_DECAY = 120; // s per point: a robbery is remembered a while, not forever
const TAKA_MIN = 12; // pocket money, not a wallet
const TAKA_ROLL = 48; // …so ৳12-59, rolled once per victim so the prompt cannot flicker
const ROB_KEY = 'KeyR'; // see the header for why this key and not E
const ROB_KEYCAP = 'R'; // the single letter the HUD prompt shows (E on touch)
const PUNCH_ANIM = 0.26; // s, fist out and back
const KICK_ANIM = 0.44; // s, the boot swings heavier and slower

// Bangla over the victim's head, flavour only and never translated — the same
// call traffic.js makes for its run-over lines (owner-approved, 2026-09-21).
const ROBBED_LINES = ['ওই! আমার টাকা!', 'চোর! চোর! ধরে ফেলো!', 'আরে না! পকেট খালি!'];

/**
 * @param {{ scene: object, camera: object, player: object, peds: object, streetlife: object, isBlocked: () => boolean }} options
 *   `scene` receives the first-person swing model; `camera` is read for the
 *   view basis and given a small recoil; `peds` is buildPedestrians()'s
 *   result (uses .agents/.strike/.panic/.say); `streetlife` is
 *   createStreetLife()'s (uses .state for the wallet and .ui for the toast);
 *   `isBlocked` reports menus, the intro, driving, riding.
 */
export function createStreetFight({ scene, camera, player, peds, streetlife, isBlocked }) {
  const state = {
    notoriety: 0, // persisted: streetlife.state.data.notoriety (loaded below)
    cooldownUntil: 0, // performance.now() ms
    lastHitAt: 0, // for scripted verification via window.__mirpur.streetFight
  };
  state.notoriety = streetlife?.state?.data?.notoriety || 0;

  // Facing is refreshed per attack (not per frame) and reused by the target
  // scan, so no vector object is ever allocated in a hot path.
  const facing = { x: 0, z: 0 };
  let holdT = 0;
  let holding = false;
  let kicked = false; // one kick per hold, however long the key stays down
  let scanT = 0;
  let decayT = 0;
  let prompt = '';
  let noise = null; // one cached noise buffer per session (audio.js helper)

  // ---- Sound: two one-shots on the shared context -------------------------
  /** @param {'whiff' | 'thud' | 'kick' | 'coin'} kind */
  function sfx(kind) {
    const audio = ensureAudioContext();
    if (!audio || !audio.ctx) return;
    const { ctx, master } = audio;
    const t = ctx.currentTime;
    if (kind === 'coin') {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      g.connect(master);
      for (const [at, freq] of [[0, 880], [0.08, 1318.5]]) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + at);
        osc.connect(g);
        osc.start(t + at);
        osc.stop(t + at + 0.14);
      }
      return;
    }
    if (!noise) noise = whiteNoiseBuffer(ctx, 0.25);
    if (kind === 'whiff') {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.setValueAtTime(900, t);
      band.frequency.exponentialRampToValueAtTime(300, t + 0.14);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      src.connect(band).connect(g).connect(master);
      src.start(t);
      src.stop(t + 0.2);
      return;
    }
    // 'thud' | 'kick': a low sine dropping off a cliff, plus a stick of noise.
    const hard = kind === 'kick';
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(hard ? 0.55 : 0.34, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (hard ? 0.3 : 0.18));
    g.connect(master);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(hard ? 150 : 190, t);
    osc.frequency.exponentialRampToValueAtTime(hard ? 52 : 90, t + (hard ? 0.22 : 0.13));
    osc.connect(g);
    osc.start(t);
    osc.stop(t + 0.32);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(hard ? 0.3 : 0.18, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    src.connect(hp).connect(ng).connect(master);
    src.start(t);
    src.stop(t + 0.09);
  }

  // ---- The swing -----------------------------------------------------------
  //
  // A first-person fist/boot, placed from the view basis each frame of a
  // swing and hidden the rest of the time. World-space rather than parented
  // to the camera: the camera is not in the scene graph (main.js renders
  // scene3 with it), and this avoids introducing an overlay scene for two
  // boxes. In third person it stays hidden and the avatar's own limbs do the
  // work — player.js forwards `player.swingPose` into avatar.update.
  //
  // Cost: two meshes / two draw calls while a swing plays (~0.3 s), zero
  // triangles and zero calls otherwise, plus a small camera recoil that is
  // re-applied per frame (player.update rewrites the camera from yaw/pitch
  // every frame, so it cannot accumulate).

  const SKIN = new THREE.Color(0x8a6a4f);
  const SLEEVE = new THREE.Color(0x3f5f8c);
  const SHOE = new THREE.Color(0x24262a);
  const TROUSER = new THREE.Color(0x33363c);

  // View-space anchor points: right, up (negative = below the eye), forward.
  const PUNCH_READY = { r: 0.34, u: -0.30, f: 0.38 };
  const PUNCH_LAND = { r: 0.15, u: -0.17, f: 0.64 };
  const KICK_READY = { r: 0.12, u: -0.95, f: 0.30 };
  const KICK_LAND = { r: 0.10, u: -0.30, f: 0.74 };

  /**
   * Merge `parts` ({ w, h, d, z, color }) into one vertex-coloured box chain,
   * laid along -Z so the mesh's local forward is the view direction. This is
   * the same merge-instead-of-group pattern avatar.js uses: one mesh, one
   * material, one draw call per limb.
   */
  function limbMesh(parts) {
    const geos = parts.map((p) => {
      const g = new THREE.BoxGeometry(p.w, p.h, p.d);
      g.translate(0, p.y ?? 0, p.z);
      return g;
    });
    const merged = mergeGeometries(geos, false);
    const colors = new Float32Array(merged.attributes.position.count * 3);
    let at = 0;
    for (let i = 0; i < geos.length; i++) {
      const n = geos[i].attributes.position.count;
      for (let k = 0; k < n; k++) parts[i].color.toArray(colors, (at + k) * 3);
      at += n;
      geos[i].dispose();
    }
    merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.frustumCulled = false; // positioned per frame from the camera; never cull it
    return mesh;
  }

  const fistMesh = limbMesh([
    { w: 0.075, h: 0.075, d: 0.22, z: -0.10, color: SLEEVE }, // forearm
    { w: 0.105, h: 0.095, d: 0.11, y: -0.005, z: -0.26, color: SKIN }, // fist
  ]);
  const bootMesh = limbMesh([
    { w: 0.09, h: 0.09, d: 0.26, z: -0.13, color: TROUSER }, // shin
    { w: 0.11, h: 0.08, d: 0.16, y: -0.01, z: -0.33, color: SHOE }, // shoe
  ]);
  const swingGroup = new THREE.Group();
  swingGroup.name = 'street-fight:swing';
  swingGroup.add(fistMesh, bootMesh);
  swingGroup.visible = false;
  scene?.add(swingGroup);

  // One reused object handed to player.js each frame of a third-person swing
  // (no allocation per frame), null the rest of the time.
  const swingPose = { kind: 'punch', t: 0 };
  let swingKind = null;
  let swingT = 0;

  /**
   * @param {'punch' | 'kick'} kind
   * @param {number} ease 0..1 out-and-back progress
   */
  function poseSwing(kind, ease) {
    const punch = kind === 'punch';
    const from = punch ? PUNCH_READY : KICK_READY;
    const to = punch ? PUNCH_LAND : KICK_LAND;
    const right = Math.cos(player.yaw); // player.js: right = (cos yaw, 0, -sin yaw)
    const rightZ = -Math.sin(player.yaw);
    const fwdX = -Math.sin(player.yaw); // player.js: forward = (-sin yaw, 0, -cos yaw)
    const fwdZ = -Math.cos(player.yaw);
    const r = from.r + (to.r - from.r) * ease;
    const u = from.u + (to.u - from.u) * ease;
    const f = from.f + (to.f - from.f) * ease;
    swingGroup.position.set(
      camera.position.x + right * r + fwdX * f,
      camera.position.y + u,
      camera.position.z + rightZ * r + fwdZ * f,
    );
    // Follow the look direction; the roll leans into the swing.
    swingGroup.rotation.set(player.pitch, player.yaw, (punch ? -0.3 : 0.16) * ease, 'YXZ');
    fistMesh.visible = punch;
    bootMesh.visible = !punch;
  }

  /** @param {'punch' | 'kick'} kind */
  function playSwing(kind) {
    swingKind = kind;
    swingT = 0;
    swingGroup.visible = !player.thirdPerson;
  }

  function endSwing() {
    swingKind = null;
    swingT = 0;
    swingGroup.visible = false;
    player.swingPose = null;
  }

  // ---- Targeting ----------------------------------------------------------
  /** On foot, street level, nothing else owning the player. */
  function canFight() {
    if (isBlocked && isBlocked()) return false;
    if (player.flying || player.inLift || player.inRide) return false;
    // feetY > 1 is the concourse/platform gate streetlife already uses: the
    // crowd up there is scenery on its own deck, not a street to brawl on.
    return player.feetY <= 1;
  }

  function face() {
    // player.js: getForward() is (-sin(yaw), 0, -cos(yaw)).
    facing.x = -Math.sin(player.yaw);
    facing.z = -Math.cos(player.yaw);
  }

  /**
   * Nearest standing agent inside `range` and inside the facing cone. One
   * pass, no raycast, no allocation — called on a press, never per frame.
   * @returns {object | null}
   */
  function findTarget(range) {
    const list = peds && peds.agents;
    if (!list) return null;
    const px = player.position.x;
    const pz = player.position.z;
    const fx = facing.x;
    const fz = facing.z;
    let best = null;
    let bestD2 = range * range;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead) continue; // already on the ground: nothing left to hit
      const ax = a._wx !== undefined ? a._wx : a.px;
      const az = a._wz !== undefined ? a._wz : a.pz;
      if (ax === undefined || az === undefined) continue;
      const dx = ax - px;
      const dz = az - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 > bestD2) continue;
      const d = Math.sqrt(d2) || 1;
      if ((dx * fx + dz * fz) / d < CONE) continue;
      bestD2 = d2;
      best = a;
    }
    return best;
  }

  /**
   * Throw a hit. Called from the Q keydown (punch) and from update()'s hold
   * timer (kick); the touch button calls it as a punch.
   * @param {'punch' | 'kick'} kind
   * @returns {boolean} true when something was hit
   */
  function attack(kind = 'punch') {
    if (!canFight()) return false;
    const now = performance.now();
    if (now < state.cooldownUntil) return false;
    const hard = kind === 'kick';
    state.cooldownUntil = now + (hard ? KICK_CD : PUNCH_CD) * 1000;
    face();
    playSwing(kind); // the swing plays on a whiff too: the animation is the tell
    const target = findTarget(hard ? KICK_RANGE : PUNCH_RANGE);
    if (target && peds.strike) {
      const hit = peds.strike(target, facing.x, facing.z, hard ? KICK_POWER : PUNCH_POWER, hard);
      if (hit) {
        state.lastHitAt = now;
        sfx(hard ? 'kick' : 'thud');
        return true;
      }
    }
    sfx('whiff');
    return false;
  }

  // ---- Robbery ------------------------------------------------------------
  /**
   * Nearest downed, un-robbed body in arm's reach. Also where the "can be
   * robbed again" flags are cleared: traffic.js recycles the same agent
   * object for the next life, so living agents reset here rather than
   * traffic.js needing to know robbery exists.
   * @returns {object | null}
   */
  function findDowned() {
    const list = peds && peds.agents;
    if (!list) return null;
    const px = player.position.x;
    const pz = player.position.z;
    let best = null;
    let bestD2 = ROBBABLE_RANGE * ROBBABLE_RANGE;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.dead) {
        if (a.robbed) {
          a.robbed = false;
          a.robTaka = undefined;
        }
        continue;
      }
      if (a.robbed || !a.rlanded) continue; // still in the air: wait for it to land
      const dx = a.rx - px;
      const dz = a.rz - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 > bestD2) continue;
      bestD2 = d2;
      best = a;
    }
    return best;
  }

  /** The victim's pocket money, rolled once when first offered. */
  function robAmount(a) {
    if (a.robTaka === undefined) a.robTaka = TAKA_MIN + Math.floor(Math.random() * TAKA_ROLL);
    return a.robTaka;
  }

  /**
   * R (or the touch Interact button) on a downed pedestrian. Scans on the
   * press rather than trusting the 4 Hz prompt, so the key is never dead for
   * the fraction of a second before the next scan. Returns false when there
   * is nobody to rob, so the touch button can fall through to the normal
   * interact chain.
   * @returns {boolean} true when the key was consumed
   */
  function interact() {
    if (!canFight()) return false;
    const a = findDowned();
    if (!a) return false;
    const taka = robAmount(a);
    a.robbed = true;
    streetlife.state.earn(taka);
    state.notoriety += 1;
    streetlife.state.data.notoriety = state.notoriety;
    streetlife.state.save();
    streetlife.ui?.toast(`+৳${taka} · ${tr('Robbed')} · ${tr('notoriety')} ${state.notoriety}`, 'warn');
    if (peds.say) peds.say(a, ROBBED_LINES[Math.floor(Math.random() * ROBBED_LINES.length)], 2.6);
    if (peds.panic) peds.panic(a.rx, a.rz); // the cost of being seen: the pavement empties
    sfx('coin');
    prompt = '';
    return true;
  }

  // ---- Input --------------------------------------------------------------
  // The module owns Q (press, hold, release), R (rob) and left-click while
  // locked. Robbery is deliberately NOT on E: main.js's E chain (hailing a
  // ride, cha, gates, boarding) must stay unambiguous — see the header.
  // Nothing here calls preventDefault(), so drive.js's look-behind (R while
  // driving) and the full map's recenter (R while the map is open) keep
  // working; in both of those modes canFight() is false and this handler
  // returns before doing anything.
  /** @param {KeyboardEvent} e */
  function onKeyDown(e) {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof HTMLElement
      && (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName))) return;
    if (e.code === 'KeyQ') {
      if (!canFight()) return;
      // Punch on the press, not the release: a jab has to feel immediate, and
      // the kick is the same hold measured a little longer, not a second key.
      holding = true;
      holdT = 0;
      kicked = false;
      attack('punch');
      return;
    }
    if (e.code === ROB_KEY) interact();
  }

  /** @param {KeyboardEvent} e */
  function onKeyUp(e) {
    if (e.code !== 'KeyQ') return;
    holding = false;
    kicked = false;
  }

  /** @param {MouseEvent} e */
  function onMouseDown(e) {
    // Locked only: the click that requests the lock (main.js's canvas click)
    // is also a mousedown, and it must not throw a punch on the way in.
    if (e.button !== 0 || !player.locked || !canFight()) return;
    attack('punch');
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  player.dom.addEventListener('mousedown', onMouseDown);

  // ---- Frame --------------------------------------------------------------
  /**
   * @param {number} dt
   * @param {boolean} suspended true while another mode owns the player (driving, train, lift, intro, menus)
   * @returns {string} HUD prompt line, '' when there is nothing to offer
   */
  function update(dt, suspended) {
    // A kick that would land into a menu or the car is dropped, not queued:
    // attack() checks canFight() as well, and `kicked` stops the retry.
    if (holding && !kicked) {
      holdT += dt;
      if (holdT >= KICK_HOLD) {
        kicked = true;
        attack('kick');
      }
    }

    // The swing runs on its own clock, before the suspension gate, so a menu
    // or the car opening mid-swing ends it rather than leaving a fist hanging
    // in the air. Camera recoil is added here because street-fight.update()
    // runs after player.update() and before the render: player.update()
    // rewrites the camera from yaw/pitch next frame, so nothing accumulates.
    if (swingKind) {
      if (suspended) {
        endSwing();
      } else {
        swingT += dt;
        const t = swingT / (swingKind === 'kick' ? KICK_ANIM : PUNCH_ANIM);
        if (t >= 1) {
          endSwing();
        } else {
          // Fast out, slower back: the fist is at the target around t = 0.34.
          const k = t < 0.34 ? t / 0.34 : 1 - (t - 0.34) / 0.66;
          const ease = k * k * (3 - 2 * k);
          camera.rotation.x += (swingKind === 'kick' ? 0.02 : 0.012) * ease;
          camera.rotation.z += (swingKind === 'kick' ? 0.012 : 0.008) * ease;
          if (player.thirdPerson) {
            // Third person: the avatar's own arm/leg swings (avatar.js).
            swingGroup.visible = false;
            swingPose.kind = swingKind;
            swingPose.t = t;
            player.swingPose = swingPose;
          } else {
            poseSwing(swingKind, ease);
            player.swingPose = null;
          }
        }
      }
    }

    if (suspended) {
      prompt = '';
      return '';
    }

    decayT += dt;
    if (decayT >= NOTORIETY_DECAY) {
      decayT = 0;
      if (state.notoriety > 0) {
        state.notoriety -= 1;
        streetlife.state.data.notoriety = state.notoriety;
        streetlife.state.save();
      }
    }

    scanT -= dt;
    if (scanT <= 0) {
      scanT = ROB_SCAN;
      const a = canFight() ? findDowned() : null;
      // The keycap follows the input the player actually has: R on a
      // keyboard, E (the touch Interact button) on a phone.
      const keycap = document.body.classList.contains('touch-game') ? 'E' : ROB_KEYCAP;
      prompt = a ? `${keycap}: ${tr('rob')} ৳${robAmount(a)}` : '';
    }
    return prompt;
  }

  return {
    update,
    interact,
    attack,
    state,
    /** The swing group (world-space fist/boot), exposed for scripted review. */
    swingGroup,
    /** 'punch' | 'kick' while a swing is playing, else null. */
    get swing() {
      return swingKind;
    },
    /**
     * What a punch would hit right now, for scripted review
     * (window.__mirpur.streetFight.probe()). Same scan a press runs.
     */
    probe() {
      face();
      return findTarget(PUNCH_RANGE);
    },
    /**
     * No-op today, deliberately: the swing model is placed only while a swing
     * plays and has no detail setting worth spending a knob on, and the scans
     * are event-driven (see the header). Declared and wired in main.js so the
     * system obeys the same quality contract as every other one.
     */
    setDetailScale() {},
    /** No-op today: no shader, no particle, no per-pixel work (see above). */
    setQuality() {},
  };
}



