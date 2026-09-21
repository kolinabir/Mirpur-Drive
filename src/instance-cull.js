/**
 * instance-cull.js
 *
 * Distance culling for map-wide InstancedMeshes (street lights, power poles).
 * One InstancedMesh spanning 4 km has a 5 km bounding sphere, so three.js can
 * never frustum-cull it and every instance is transformed every frame: 6,300
 * poles were 212k triangles, nearly all of them sub-pixel.
 *
 * The mesh keeps its one draw call. Its instance buffer is re-packed with only
 * the instances in grid cells near the viewer, and `count` is lowered to match.
 * Re-packing happens when the viewer has moved REPACK_STEP metres, not per
 * frame. A master copy of the matrices is kept, so an instance has a stable
 * index there even though its slot in the live buffer moves: anything that
 * edits an instance after registration must go through `setMatrixAt` below
 * (see src/destructibles.js).
 */
const CELL = 128;
const REPACK_STEP = 48;

/**
 * @param {import('three').InstancedMesh[]} meshes meshes to cull; each is indexed independently
 * @param {number} range metres; instances further than this from the viewer are not drawn
 */
export function createInstanceCuller(meshes, range) {
  const entries = meshes.filter((m) => m && m.isInstancedMesh && m.count > 0).map((mesh) => {
    const total = mesh.count;
    const master = mesh.instanceMatrix.array.slice(0, total * 16);
    const colors = mesh.instanceColor ? mesh.instanceColor.array.slice(0, total * 3) : null;
    /** @type {Map<string, number[]>} */
    const cells = new Map();
    for (let i = 0; i < total; i++) {
      const key = `${Math.floor(master[i * 16 + 12] / CELL)},${Math.floor(master[i * 16 + 14] / CELL)}`;
      let list = cells.get(key);
      if (!list) cells.set(key, (list = []));
      list.push(i);
    }
    mesh.frustumCulled = false; // the packed set is already local; the old sphere is map-sized
    mesh.userData.cullEntry = true;
    return { mesh, total, master, colors, cells };
  });

  const fullRange = range;
  let lastX = Infinity;
  let lastZ = Infinity;
  let dirty = true;
  // A cell is kept when any part of it can be within range before the next re-pack.
  let reach = range + REPACK_STEP + CELL * Math.SQRT1_2;

  function pack(x, z) {
    const c0x = Math.floor((x - reach) / CELL);
    const c1x = Math.floor((x + reach) / CELL);
    const c0z = Math.floor((z - reach) / CELL);
    const c1z = Math.floor((z + reach) / CELL);
    for (const { mesh, master, colors, cells } of entries) {
      const live = mesh.instanceMatrix.array;
      const liveColors = colors ? mesh.instanceColor.array : null;
      let n = 0;
      for (let cx = c0x; cx <= c1x; cx++) {
        for (let cz = c0z; cz <= c1z; cz++) {
          if (Math.hypot((cx + 0.5) * CELL - x, (cz + 0.5) * CELL - z) > reach) continue;
          const list = cells.get(`${cx},${cz}`);
          if (!list) continue;
          for (const i of list) {
            live.set(master.subarray(i * 16, i * 16 + 16), n * 16);
            if (liveColors) liveColors.set(colors.subarray(i * 3, i * 3 + 3), n * 3);
            n++;
          }
        }
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (liveColors) mesh.instanceColor.needsUpdate = true;
    }
  }

  return {
    /** @param {{x: number, z: number}} viewPos */
    update(viewPos) {
      if (!dirty && Math.hypot(viewPos.x - lastX, viewPos.z - lastZ) < REPACK_STEP) return;
      lastX = viewPos.x;
      lastZ = viewPos.z;
      dirty = false;
      pack(lastX, lastZ);
    },
    /** @param {number} scale 0.5..1, from the perf governor's detail stage */
    setRangeScale(scale) {
      reach = fullRange * scale + REPACK_STEP + CELL * Math.SQRT1_2;
      dirty = true;
    },
    /** Edit an instance by its ORIGINAL index (stable across re-packs). */
    setMatrixAt(mesh, index, matrix) {
      const entry = entries.find((e) => e.mesh === mesh);
      if (!entry) {
        mesh.setMatrixAt(index, matrix);
        mesh.instanceMatrix.needsUpdate = true;
        return;
      }
      matrix.toArray(entry.master, index * 16);
      dirty = true;
    },
    get stats() {
      return entries.map((e) => `${e.mesh.count}/${e.total}`);
    },
  };
}
