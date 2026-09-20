/**
 * walkable.js
 *
 * The walkable-surface registry described in docs/WALKABLE-INTERIOR-DESIGN.md.
 * Two primitive kinds (slab, ramp) plus a portal helper (lift), bucketed into
 * a 20 m grid so `supportHeightAt` only ever tests a handful of candidates.
 * Ground (y=0) is the implicit fallback everywhere in the map, so behaviour
 * away from stations is unchanged even when nothing is registered.
 *
 * Also carries `addSegments`, a wrapper around the collision object returned
 * by `city.js#buildCollisionGrid` that pushes extra `[ax,az,bx,bz]` wall
 * segments into its existing bucket Map using the same key scheme — city.js
 * itself is not touched.
 */

const BUCKET = 20;
export const STEP_UP = 0.45;
export const MAX_DROP = 6;
export const ESCALATOR_SPEED = 0.75; // m/s

function key(cx, cz) {
  return `${cx},${cz}`;
}

function bucketRange(minX, maxX, minZ, maxZ) {
  return {
    cx0: Math.floor(minX / BUCKET),
    cx1: Math.floor(maxX / BUCKET),
    cz0: Math.floor(minZ / BUCKET),
    cz1: Math.floor(maxZ / BUCKET),
  };
}

/** World point -> surface-local (rotated by -rot around cx,cz). */
function toLocal(surf, x, z) {
  const dx = x - surf.cx;
  const dz = z - surf.cz;
  const c = Math.cos(-surf.rot);
  const s = Math.sin(-surf.rot);
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}

/** Surface-local direction (0,+1 or 0,-1) -> world-space unit vector. */
function localZToWorld(rot, sign) {
  return { x: -Math.sin(rot) * sign, z: Math.cos(rot) * sign };
}

function heightAt(surf, x, z) {
  const { lx, lz } = toLocal(surf, x, z);
  if (Math.abs(lx) > surf.halfW || Math.abs(lz) > surf.halfD) return null;
  if (surf.kind === 'slab') return surf.y;
  if (surf.kind === 'ramp') {
    const t = Math.max(0, Math.min(1, (lz + surf.halfD) / (2 * surf.halfD)));
    return surf.y0 + (surf.y1 - surf.y0) * t;
  }
  return null;
}

export function createWalkableRegistry() {
  const buckets = new Map();
  const surfaces = [];

  function register(surf) {
    surfaces.push(surf);
    const r = Math.hypot(surf.halfW, surf.halfD); // conservative rotation-safe AABB
    const { cx0, cx1, cz0, cz1 } = bucketRange(surf.cx - r, surf.cx + r, surf.cz - r, surf.cz + r);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const k = key(cx, cz);
        let arr = buckets.get(k);
        if (!arr) buckets.set(k, (arr = []));
        arr.push(surf);
      }
    }
    return surf;
  }

  /** Horizontal rectangle at a fixed height. rot = yaw, radians. */
  function slab(y, cx, cz, halfW, halfD, rot = 0, opts = {}) {
    return register({ kind: 'slab', y, cx, cz, halfW, halfD, rot, ...opts });
  }

  /**
   * Rectangle whose height lerps y0 (at local -Z) to y1 (local +Z).
   * opts.moving: true for an escalator; opts.dir: 1 (toward +localZ, the
   * default "up" sense) or -1 (down) — see movingDeltaAt.
   */
  function ramp(y0, y1, cx, cz, halfW, halfD, rot = 0, opts = {}) {
    return register({ kind: 'ramp', y0, y1, cx, cz, halfW, halfD, rot, dir: 1, ...opts });
  }

  /**
   * A lift: two slabs (already registered elsewhere, e.g. the concourse and
   * platform floor slabs) plus the trigger volume the interaction layer uses
   * to know the player is inside the shaft. Interior.js drives the actual
   * ~1.5 s height easing; this just carries the pairing + shaft footprint.
   */
  function portal(aSlab, bSlab, cx, cz, halfW, halfD, opts = {}) {
    return { kind: 'portal', a: aSlab, b: bSlab, cx, cz, halfW, halfD, ...opts };
  }

  /**
   * Highest surface at (x,z) that is within STEP_UP above currentY and no
   * more than MAX_DROP below it. Ground (y=0) is always a candidate subject
   * to the same bounds, so behaviour away from any registered surface is
   * exactly the old pinned-to-ground-eye-height behaviour.
   */
  function supportHeightAt(x, z, currentY) {
    const cx = Math.floor(x / BUCKET);
    const cz = Math.floor(z / BUCKET);
    let best = null;
    const consider = (h) => {
      if (h === null) return;
      if (h > currentY + STEP_UP) return;
      if (currentY - h > MAX_DROP) return;
      if (best === null || h > best) best = h;
    };
    consider(0); // ground fallback
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const arr = buckets.get(key(cx + i, cz + j));
        if (!arr) continue;
        for (const surf of arr) {
          if (surf.kind !== 'slab' && surf.kind !== 'ramp') continue;
          consider(heightAt(surf, x, z));
        }
      }
    }
    return best;
  }

  /** dt-scaled world-space drift if (x,z) sits on a `moving: true` surface. */
  function movingDeltaAt(x, z, dt, currentY) {
    const cx = Math.floor(x / BUCKET);
    const cz = Math.floor(z / BUCKET);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const arr = buckets.get(key(cx + i, cz + j));
        if (!arr) continue;
        for (const surf of arr) {
          if (!surf.moving) continue;
          const height = heightAt(surf, x, z);
          if (height === null || Math.abs(height - currentY) > 0.5) continue;
          const w = localZToWorld(surf.rot, surf.dir || 1);
          const speed = surf.speed ?? ESCALATOR_SPEED;
          return { x: w.x * speed * dt, z: w.z * speed * dt };
        }
      }
    }
    return null;
  }

  /**
   * Push extra `[ax,az,bx,bz]` wall segments into an existing collision
   * object (from city.js#buildCollisionGrid) using its own bucket scheme, so
   * resolveCollision picks them up with no change to city.js.
   */
  function addSegments(collision, segs) {
    const cellSize = collision.cell;
    for (const seg of segs) {
      const [ax, az, bx, bz] = seg;
      const cx0 = Math.floor(Math.min(ax, bx) / cellSize);
      const cx1 = Math.floor(Math.max(ax, bx) / cellSize);
      const cz0 = Math.floor(Math.min(az, bz) / cellSize);
      const cz1 = Math.floor(Math.max(az, bz) / cellSize);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const k = cx * 100000 + cz;
          let arr = collision.grid.get(k);
          if (!arr) collision.grid.set(k, (arr = []));
          arr.push(seg);
        }
      }
    }
    if (!collision.addSegments) collision.addSegments = (s) => addSegments(collision, s);
  }

  return { slab, ramp, portal, supportHeightAt, movingDeltaAt, addSegments, surfaces };
}
