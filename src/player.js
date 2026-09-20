/**
 * player.js
 *
 * First-person controller. Two modes: walking, which is collided against the
 * building footprints and held at eye height, and a free-fly camera for
 * looking at the corridor from above.
 */

import * as THREE from 'three';
import { resolveCollision } from './city.js';
import { touchInput, isGameplayBlocked, isEditableTarget, prefersTouchControls } from './mobile-controls.js';
import { createAvatar, SHOULDER_HEIGHT } from './avatar.js';

// Reusable scratch objects — avoids per-frame heap allocations in update().
const _dir = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _fwd = new THREE.Vector3();

/**
 * Normalise a keydown event to a KeyboardEvent.code-style string.
 *
 * Real browsers always populate `code`. Some automated/synthetic input
 * sources (on-screen keyboards, remote-control harnesses) only populate
 * `key`, leaving `code` empty — which would silently break every keyboard
 * shortcut here since they all switch on `code`. Falling back to `key`
 * keeps movement and the quick-travel keys working either way.
 */
export function normalizeKeyCode(e) {
  if (e.code) return e.code;
  const key = e.key;
  if (!key) return '';
  if (key.length === 1) {
    const upper = key.toUpperCase();
    if (upper >= 'A' && upper <= 'Z') return `Key${upper}`;
    if (key >= '0' && key <= '9') return `Digit${key}`;
  }
  const map = {
    ' ': 'Space',
    Shift: 'ShiftLeft',
    Control: 'ControlLeft',
    Alt: 'AltLeft',
    Escape: 'Escape',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
  };
  return map[key] || key;
}

const EYE_HEIGHT = 1.68;
const WALK_SPEED = 3.1;
const RUN_SPEED = 7.4;
const FLY_SPEED = 26;
const FLY_FAST = 90;
const PLAYER_RADIUS = 0.42;
const ACCEL = 14;
const LOOK_SPEED = 0.0022;
// Keyboard look, for automated review: mouse-look needs pointer lock, which
// an automated browser cannot obtain. `[` `]` pitch down/up, `,` `.` yaw.
const KEY_LOOK_SPEED = 1.1; // rad/s
const STEP_UP = 0.45; // m the player can climb per frame without a fall
const MAX_DROP = 6; // m of downward reach for the step/landing query
const GRAVITY = 9.8;
const JUMP_SPEED = 4.8; // m/s, ~1.17 m vertical jump height
const FEET_SNAP_RATE = 20; // 1/s, how fast feetY chases a found support

// Third-person camera boom (P5-TPS). Same spring-smoothing idea as
// drive.js's CHASE_DIST/CHASE_HEIGHT/CHASE_SMOOTH, reused rather than
// imported — drive.js is owned by another executor.
const TPS_DIST = 3.5; // m behind the shoulder pivot, before wall clamping
const TPS_UP = 1.7; // m above the shoulder pivot
const TPS_LOOK_AHEAD = 5; // m, look-at point projected in front of the pivot
const TPS_SMOOTH = 6; // 1/s
const TPS_SKIN = 0.35; // m, how far off a hit wall the camera stops
const TPS_MIN_DIST = 0.4; // m, never collapse the boom fully onto the pivot

/**
 * Nearest intersection of ray (ox,oz)+t*(dx,dz), t in [0,maxDist], against a
 * set of 2D wall segments [ax,az,bx,bz] (the same format the collision grid
 * in city.js stores — building footprint edges plus whatever interior walls
 * src/interior.js has registered via collision.addSegments). Returns the
 * hit distance or null. This is what "raycasts the boom against the
 * collision geometry" means here: the collision grid is already a 2D wall
 * list, so a 2D ray/segment test is exact and cheap, no THREE.Raycaster or
 * mesh traversal needed.
 */
function rayHitDistance(ox, oz, dx, dz, maxDist, segs) {
  let best = null;
  for (const s of segs) {
    const sx = s[2] - s[0];
    const sz = s[3] - s[1];
    const rxs = dx * sz - dz * sx;
    if (Math.abs(rxs) < 1e-9) continue; // parallel
    const qpx = s[0] - ox;
    const qpz = s[1] - oz;
    const t = (qpx * sz - qpz * sx) / rxs;
    const u = (qpx * dz - qpz * dx) / rxs;
    if (t >= 0 && t <= maxDist && u >= 0 && u <= 1) {
      if (best === null || t < best) best = t;
    }
  }
  return best;
}

export class Player {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {HTMLElement} domElement
   * @param {object} collision  from buildCollisionGrid
   */
  constructor(camera, domElement, collision, walkable = null, debug = false) {
    this.camera = camera;
    this.dom = domElement;
    this.collision = collision;
    // Walkable-surface registry (src/walkable.js): slabs/ramps/portals that
    // stations register. Null is fine — supportHeightAt then only ever sees
    // the y=0 ground fallback, so behaviour away from stations is unchanged.
    this.walkable = walkable;
    // Dev-only gate (docs/briefs/P1-PERF-BOUNDARY.md row P1-D): fly mode is
    // only reachable when `?debug` (or localStorage.mirpurDebug=1) is set.
    // main.js decides this and passes it in; player.js just obeys it.
    this.debug = debug;
    // Playable-boundary helper (docs/briefs/P1-PERF-BOUNDARY.md row P1-A),
    // set by main.js after construction: { distanceToCorridor(x,z) ->
    // {dist,nx,nz}, WARN, PUSH, HARD }. Null is fine — walking is then
    // unbounded, same as before this pass.
    this.boundary = null;
    // True once distanceToCorridor(x,z) > boundary.WARN; main.js reads this
    // every frame to show/hide the "Turn back" HUD line. drive.js also sets
    // this directly while driving, since it no-ops player.update().
    this.leavingMirpur = false;

    this.position = new THREE.Vector3(0, EYE_HEIGHT, 0);
    this.velocity = new THREE.Vector3();
    // feetY is the authoritative walking height (the surface the player
    // stands on); camera.position.y is derived from it every frame. Fly mode
    // ignores feetY entirely and drives position.y directly.
    this.feetY = 0;
    this.vy = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.flying = false;
    this.locked = false;
    this.switching = false;

    // Third-person view toggle (P5-TPS, key P — V/N/C/F/T/M/H/E/1-6/WASD/
    // Shift/Space are all already bound elsewhere). Persisted so a reload
    // keeps the owner's choice. First person (thirdPerson = false) is the
    // default and is rendered by the exact same two lines as before this
    // pass; see the tail of update().
    let savedThird = false;
    try {
      savedThird = localStorage.getItem('mirpurThirdPerson') === '1';
    } catch {
      /* ignore (privacy mode etc.) */
    }
    this.thirdPerson = savedThird;
    this.avatar = createAvatar();
    this._camPos = new THREE.Vector3();
    this._camInit = false;
    this._fast = false;
    this._groundSpeed = 0;
    this._sceneRef = null;

    this.keys = new Set();
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onLockChange = this._onLockChange.bind(this);
    this._clearInput = () => { this.keys.clear(); this.velocity.set(0, 0, 0); };

    this.listeners = { modechange: [], teleport: [] };

    window.addEventListener('blur', this._clearInput);
    document.addEventListener('visibilitychange', this._clearInput);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  on(event, fn) {
    this.listeners[event]?.push(fn);
  }

  _emit(event, payload) {
    for (const fn of this.listeners[event] || []) fn(payload);
  }

  requestLock() {
    // Some embedded/sandboxed hosts (an iframe whose document isn't the
    // pointer-lock target, certain automation harnesses) reject this outright.
    // Movement and every keyboard shortcut here work without the lock — it
    // only gates mouse-look — so a rejection is silently swallowed rather
    // than left as an unhandled promise rejection.
    if (document.body.classList.contains('touch-game') || prefersTouchControls()) return;
    this.dom.requestPointerLock?.()?.catch?.(() => {});
  }

  _onLockChange() {
    this.locked = document.pointerLockElement === this.dom;
    this._emit('modechange', { locked: this.locked, flying: this.flying, thirdPerson: this.thirdPerson });
  }

  _onKeyDown(e) {
    // Let the browser keep its own shortcuts.
    if (e.metaKey || e.ctrlKey || e.altKey || isEditableTarget(e.target) || this.switching || isGameplayBlocked()) return;
    const code = normalizeKeyCode(e);
    this.keys.add(code);

    // Fly is available to everyone again (owner request 2026-09-07, second
    // session): it was gated behind ?debug by P1-PERF-BOUNDARY row P1-D.
    // `this.debug` is still passed in and still gates nothing else here;
    // to re-gate, restore `&& this.debug` on the next line.
    if (code === 'KeyF' && !e.repeat && !this.ridingTrain && !this.inLift) {
      this.flying = !this.flying;
      this.velocity.set(0, 0, 0);
      // Dropping out of fly mode: seed feetY from wherever the camera was
      // and let gravity + the walkable registry settle it onto the nearest
      // surface below, rather than snapping to ground level.
      if (!this.flying) {
        this.feetY = this.position.y - EYE_HEIGHT;
        this.vy = 0;
      }
      this._emit('modechange', { locked: this.locked, flying: this.flying, thirdPerson: this.thirdPerson });
    }

    // View-mode cycle (P5-TPS): first-person <-> third-person. First person
    // stays the default; toggling never touches this.flying or anything
    // else the fly/walk code above reads.
    if (code === 'KeyP' && !e.repeat) this.toggleView();
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
      e.preventDefault();
    }
  }

  _onKeyUp(e) {
    this.keys.delete(normalizeKeyCode(e));
  }

  toggleView() {
    if (this.inLift || this.ridingTrain) return;
    this.thirdPerson = !this.thirdPerson;
    try { localStorage.setItem('mirpurThirdPerson', this.thirdPerson ? '1' : '0'); } catch { /* Storage can be disabled. */ }
    this._camInit = false;
    this._emit('modechange', { locked: this.locked, flying: this.flying, thirdPerson: this.thirdPerson });
  }

  _onMouseMove(e) {
    if (!this.locked || this.switching || isGameplayBlocked()) return;
    this.look(e.movementX, e.movementY);
  }

  look(dx, dy) {
    this.yaw -= dx * LOOK_SPEED;
    this.pitch -= dy * LOOK_SPEED;
    const limit = Math.PI / 2 - 0.02;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
  }

  /** Drop the player at a world position, facing the given heading. */
  teleport(x, z, y = EYE_HEIGHT, yaw = this.yaw) {
    this.position.set(x, y, z);
    this.feetY = y - EYE_HEIGHT;
    this.vy = 0;
    this.yaw = yaw;
    this.velocity.set(0, 0, 0);
    this._camInit = false;
    this._emit('teleport', { x, z });
  }

  /** Forward vector on the horizontal plane. */
  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  update(dt) {
    if (this.switching || this.inLift || isGameplayBlocked()) { this._clearInput(); return; }
    const k = { has: (code) => this.keys.has(code) || touchInput.keys.has(code) };
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) + touchInput.forward;
    const strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + touchInput.strafe;
    const fast = k.has('ShiftLeft') || k.has('ShiftRight');
    this._fast = fast; // read by _updateThirdPerson for the run-cycle avatar

    // Keyboard look for automated/no-pointer-lock review (see KEY_LOOK_SPEED
    // above). Checks both the KeyboardEvent.code name and the raw character
    // so it works whether normalizeKeyCode took the `code` or `key` path.
    const pitchUp = k.has('BracketRight') || k.has(']');
    const pitchDown = k.has('BracketLeft') || k.has('[');
    const yawLeft = k.has('Comma') || k.has(',');
    const yawRight = k.has('Period') || k.has('.');
    if (pitchUp || pitchDown) {
      this.pitch += (pitchUp ? 1 : 0) * KEY_LOOK_SPEED * dt;
      this.pitch -= (pitchDown ? 1 : 0) * KEY_LOOK_SPEED * dt;
      const limit = Math.PI / 2 - 0.02;
      this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
    }
    if (yawLeft || yawRight) {
      this.yaw += (yawLeft ? 1 : 0) * KEY_LOOK_SPEED * dt;
      this.yaw -= (yawRight ? 1 : 0) * KEY_LOOK_SPEED * dt;
    }

    if (this.flying) {
      const speed = fast ? FLY_FAST : FLY_SPEED;
      const dir = _dir.set(0, 0, 0);
      const camDir = _camDir.set(
        -Math.sin(this.yaw) * Math.cos(this.pitch),
        Math.sin(this.pitch),
        -Math.cos(this.yaw) * Math.cos(this.pitch)
      );
      const right = _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      dir.addScaledVector(camDir, fwd).addScaledVector(right, strafe);
      if (k.has('Space')) dir.y += 1;
      if (k.has('KeyC') || k.has('ControlLeft')) dir.y -= 1;
      if (dir.lengthSq() > 1) dir.normalize();

      this.velocity.lerp(dir.multiplyScalar(speed), Math.min(1, dt * 8));
      this.position.addScaledVector(this.velocity, dt);
      this.position.y = Math.max(1.2, this.position.y);
    } else {
      const speed = fast ? RUN_SPEED : WALK_SPEED;
      const dir = _dir.set(0, 0, 0);
      const f = this.forward(_fwd);
      const right = _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      dir.addScaledVector(f, fwd).addScaledVector(right, strafe);
      if (dir.lengthSq() > 1) dir.normalize();

      const target = dir.multiplyScalar(speed);
      this.velocity.x += (target.x - this.velocity.x) * Math.min(1, dt * ACCEL);
      this.velocity.z += (target.z - this.velocity.z) * Math.min(1, dt * ACCEL);

      let nx = this.position.x + this.velocity.x * dt;
      let nz = this.position.z + this.velocity.z * dt;

      // Pass the walker's head height so height-banded segments (the
      // station's concourse and platform walls, which sit 8 m and 14.5 m up)
      // are skipped at street level and only stop you when you are actually
      // on that deck. Unbanded segments still collide at every height.
      const [cx, cz] = resolveCollision(this.collision, nx, nz, PLAYER_RADIUS, this.feetY + 1.0);
      // If collision moved us a long way we walked into a corner; damp velocity.
      if (Math.hypot(cx - nx, cz - nz) > 0.01) {
        this.velocity.multiplyScalar(0.6);
      }
      nx = cx;
      nz = cz;

      // Escalator conveyor: while standing on a surface flagged `moving`,
      // drift along its direction in addition to player-driven movement.
      if (this.walkable) {
        const drift = this.walkable.movingDeltaAt(nx, nz, dt, this.feetY);
        if (drift) {
          [nx, nz] = resolveCollision(this.collision, nx + drift.x, nz + drift.z, PLAYER_RADIUS, this.feetY + 1.0);
        }
      }

      // Playable boundary (docs/briefs/P1-PERF-BOUNDARY.md row P1-A): past
      // WARN m from the nearest corridor centreline, flag it for the HUD;
      // past PUSH m, fade in a gentle nudge back toward the corridor; past
      // HARD m, clamp the position exactly onto the HARD radius so the
      // player can never wander further out, without ever presenting an
      // invisible wall inside the playable area itself.
      if (this.boundary) {
        const { dist, nx: cnx, nz: cnz } = this.boundary.distanceToCorridor(nx, nz);
        this.leavingMirpur = dist > this.boundary.WARN;
        if (dist > this.boundary.PUSH) {
          const dx = cnx - nx;
          const dz = cnz - nz;
          const dlen = Math.hypot(dx, dz) || 1;
          const ix = dx / dlen;
          const iz = dz / dlen;
          const t = Math.min(1, (dist - this.boundary.PUSH) / (this.boundary.HARD - this.boundary.PUSH));
          const push = 5 * t; // m/s^2-ish, fades in from 0 at PUSH to full at HARD
          nx += ix * push * dt;
          nz += iz * push * dt;
          this.velocity.x += ix * push * dt;
          this.velocity.z += iz * push * dt;
          if (dist > this.boundary.HARD) {
            // Hard clamp: pull straight back onto the HARD radius.
            const over = dist - this.boundary.HARD;
            nx += ix * over;
            nz += iz * over;
          }
        }
      }

      this.position.x = nx;
      this.position.z = nz;

      // Vertical: walkable-surface registry (docs/WALKABLE-INTERIOR-DESIGN.md).
      // Jump trigger: when standing on ground/support and Space is pressed.
      const currentSupport = this.walkable ? this.walkable.supportHeightAt(nx, nz, this.feetY) : (this.feetY <= STEP_UP ? 0 : null);
      const onGround = currentSupport !== null && Math.abs(this.feetY - currentSupport) <= STEP_UP + 0.05 && this.vy <= 0.1;

      if (onGround && k.has('Space')) {
        this.vy = JUMP_SPEED;
        this.feetY += this.vy * dt;
      } else if (this.vy > 0) {
        // Ascending under jump impulse: apply gravity and vertical velocity
        this.vy -= GRAVITY * dt;
        this.feetY += this.vy * dt;
      } else if (currentSupport !== null && currentSupport <= this.feetY + STEP_UP) {
        // Grounded / snapping onto walkable surface
        this.feetY += (currentSupport - this.feetY) * Math.min(1, dt * FEET_SNAP_RATE);
        this.vy = 0;
      } else {
        // Falling under gravity until a surface is crossed
        this.vy -= GRAVITY * dt;
        this.feetY += this.vy * dt;
        const landed = this.walkable ? this.walkable.supportHeightAt(nx, nz, this.feetY) : (this.feetY <= 0 ? 0 : null);
        if (landed !== null && this.feetY <= landed) {
          this.feetY = landed;
          this.vy = 0;
        }
      }

      // Head bob while walking, scaled by actual ground speed (only when grounded).
      const groundSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      this._groundSpeed = groundSpeed; // read by _updateThirdPerson
      this._bobPhase = (this._bobPhase || 0) + dt * groundSpeed * 2.1;
      const bob = onGround ? Math.sin(this._bobPhase) * Math.min(0.045, groundSpeed * 0.008) : 0;
      this.position.y = this.feetY + EYE_HEIGHT + bob;
    }

    // First person is the default and is completely unchanged: these are
    // the same two lines that always ran here. Third person only replaces
    // them while flying is off and the mode is toggled on.
    if (!this.flying && this.thirdPerson) {
      this._updateThirdPerson(dt);
    } else {
      this.camera.position.copy(this.position);
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      this.avatar.setVisible(false);
    }
  }

  /**
   * Third-person camera boom (P5-TPS). Pivot at the shoulders
   * (feetY + SHOULDER_HEIGHT, matching avatar.js), spring-smoothed the same
   * way drive.js smooths its chase cam, and raycast every frame against the
   * collision grid (city.js buildCollisionGrid + whatever interior.js has
   * added via collision.addSegments) so the boom pulls in before it would
   * poke through a wall — this is mandatory the moment the player nears a
   * station or the gap between two buildings, which is most of this map.
   */
  _updateThirdPerson(dt) {
    if (!this._sceneRef) {
      const hook = window.__mirpur;
      if (hook && hook.scene) {
        this._sceneRef = hook.scene;
        this.avatar.addedTo(this._sceneRef);
      }
    }
    this.avatar.setVisible(true);

    const speed = this._groundSpeed || 0;
    const moving = speed > 0.15;
    // Direction of travel, not camera yaw, so strafing doesn't spin the
    // avatar sideways — inverse of forward(): forward = (-sin(yaw),0,-cos(yaw)).
    const movingYaw = moving ? Math.atan2(-this.velocity.x, -this.velocity.z) : null;
    this.avatar.update(dt, {
      x: this.position.x,
      z: this.position.z,
      feetY: this.feetY,
      speed,
      running: this._fast,
      movingYaw,
    });

    const pivotX = this.position.x;
    const pivotZ = this.position.z;
    const pivotY = this.feetY + SHOULDER_HEIGHT;

    const cosPitch = Math.cos(this.pitch);
    const lookX = -Math.sin(this.yaw) * cosPitch;
    const lookY = Math.sin(this.pitch);
    const lookZ = -Math.cos(this.yaw) * cosPitch;

    let offX = -lookX * TPS_DIST;
    let offY = -lookY * TPS_DIST + TPS_UP;
    let offZ = -lookZ * TPS_DIST;

    // Raycast the (unclamped) desired boom against the collision grid and
    // pull every axis of the offset in by the same fraction — a straight
    // retract along the boom, not just a horizontal clamp — so a look-down
    // near a low wall doesn't leave the camera floating past it.
    const clampOffset = (ox, oz) => {
      const horiz = Math.hypot(ox, oz);
      if (horiz < 1e-4 || !this.collision) return 1;
      const hit = rayHitDistance(pivotX, pivotZ, ox / horiz, oz / horiz, horiz, this.collision.near(pivotX, pivotZ));
      if (hit === null) return 1;
      const clamped = Math.max(TPS_MIN_DIST, hit - TPS_SKIN);
      return clamped < horiz ? clamped / horiz : 1;
    };

    const frac = clampOffset(offX, offZ);
    offX *= frac;
    offY *= frac;
    offZ *= frac;

    const desiredX = pivotX + offX;
    const desiredY = pivotY + offY;
    const desiredZ = pivotZ + offZ;

    if (!this._camInit) {
      this._camPos.set(desiredX, desiredY, desiredZ);
      this._camInit = true;
    } else {
      const t = 1 - Math.exp(-TPS_SMOOTH * dt);
      this._camPos.x += (desiredX - this._camPos.x) * t;
      this._camPos.y += (desiredY - this._camPos.y) * t;
      this._camPos.z += (desiredZ - this._camPos.z) * t;
    }

    // Second clamp on the smoothed position itself: right after a hit
    // appears (rounding a corner into a wall) the spring can still lag a
    // frame or two behind the clamped target. Re-test the smoothed point
    // and, if it now sits past a wall, snap the spring onto the clamped
    // point so it does not spring back out through the geometry next frame.
    const sOffX = this._camPos.x - pivotX;
    const sOffY = this._camPos.y - pivotY;
    const sOffZ = this._camPos.z - pivotZ;
    const frac2 = clampOffset(sOffX, sOffZ);
    if (frac2 < 1) {
      this._camPos.x = pivotX + sOffX * frac2;
      this._camPos.y = pivotY + sOffY * frac2;
      this._camPos.z = pivotZ + sOffZ * frac2;
    }

    this.camera.position.copy(this._camPos);
    this.camera.lookAt(
      pivotX + lookX * TPS_LOOK_AHEAD,
      pivotY + lookY * TPS_LOOK_AHEAD,
      pivotZ + lookZ * TPS_LOOK_AHEAD
    );
  }

  dispose() {
    window.removeEventListener('blur', this._clearInput);
    document.removeEventListener('visibilitychange', this._clearInput);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }
}
