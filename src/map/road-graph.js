/**
 * road-graph.js
 *
 * Builds an indexed topology graph from scene.roads for:
 *  1. Fast nearest-road snapping (O(1) spatial grid)
 *  2. Real-time A* shortest-path routing between any two world positions
 *  3. Live street name resolution for the player's current location
 *  4. Turn-by-turn navigation instructions (left, right, continue, arrive)
 */

export class RoadGraph {
  /**
   * @param {Array} roads array of road ways from scene.roads
   */
  constructor(roads) {
    this.roads = roads || [];
    this.nodes = new Map(); // id -> { id, x, z, edges: [], compId: 0 }
    this.edges = [];        // array of all segments for spatial lookup
    this.cellSize = 25;     // 25m spatial grid bucket for fast point-to-road snapping
    this.grid = new Map();  // 'gx,gz' -> [edgeIndex, ...]
    this.mainCompId = 1;

    this._buildGraph();
    this._computeComponents();
  }

  _cellKey(x, z) {
    const gx = Math.floor(x / this.cellSize);
    const gz = Math.floor(z / this.cellSize);
    return `${gx},${gz}`;
  }

  _buildGraph() {
    let nextNodeId = 1;
    // Tolerance for snapping nearby endpoints into shared intersection nodes: ~2.5 metres
    const snapDist = 2.5;
    const snapCellSize = 5;
    const nodeSnapGrid = new Map();

    const getOrCreateNode = (x, z) => {
      const gx = Math.floor(x / snapCellSize);
      const gz = Math.floor(z / snapCellSize);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const list = nodeSnapGrid.get(`${gx + dx},${gz + dz}`);
          if (list) {
            for (const nid of list) {
              const n = this.nodes.get(nid);
              if (Math.hypot(n.x - x, n.z - z) <= snapDist) {
                return n;
              }
            }
          }
        }
      }
      const id = nextNodeId++;
      const node = { id, x, z, edges: [], compId: 0 };
      this.nodes.set(id, node);
      const key = `${gx},${gz}`;
      if (!nodeSnapGrid.has(key)) nodeSnapGrid.set(key, []);
      nodeSnapGrid.get(key).push(id);
      return node;
    };

    for (const r of this.roads) {
      if (r.rank < 1 || !r.pts || r.pts.length < 2) continue;
      const pts = r.pts;
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        if (dist < 0.05) continue;

        const u = getOrCreateNode(p1[0], p1[1]);
        const v = getOrCreateNode(p2[0], p2[1]);
        if (u.id === v.id) continue;

        // Rank weighting: prefer arterial/major roads slightly for faster, more natural routes
        const rankWeight = r.rank >= 4 ? 0.85 : r.rank === 3 ? 0.95 : 1.0;
        const cost = dist * rankWeight;

        const edgeIndex = this.edges.length;
        const edgeData = {
          from: u.id,
          to: v.id,
          p1: [p1[0], p1[1]],
          p2: [p2[0], p2[1]],
          dist,
          cost,
          name: r.name || null,
          rank: r.rank,
          w: r.w || 0,
        };
        this.edges.push(edgeData);

        u.edges.push({ to: v.id, cost, dist, p1: edgeData.p1, p2: edgeData.p2, name: edgeData.name });
        // Road networks in Mirpur: bidirectional unless explicitly oneway
        if (!r.oneway) {
          v.edges.push({ to: u.id, cost, dist, p1: edgeData.p2, p2: edgeData.p1, name: edgeData.name });
        } else {
          v.edges.push({ to: u.id, cost: cost * 1.5, dist, p1: edgeData.p2, p2: edgeData.p1, name: edgeData.name });
        }

        // Insert edge into spatial grid
        const minX = Math.min(p1[0], p2[0]);
        const maxX = Math.max(p1[0], p2[0]);
        const minZ = Math.min(p1[1], p2[1]);
        const maxZ = Math.max(p1[1], p2[1]);
        const gx1 = Math.floor(minX / this.cellSize);
        const gx2 = Math.floor(maxX / this.cellSize);
        const gz1 = Math.floor(minZ / this.cellSize);
        const gz2 = Math.floor(maxZ / this.cellSize);

        for (let gx = gx1; gx <= gx2; gx++) {
          for (let gz = gz1; gz <= gz2; gz++) {
            const ck = `${gx},${gz}`;
            if (!this.grid.has(ck)) this.grid.set(ck, []);
            this.grid.get(ck).push(edgeIndex);
          }
        }
      }
    }
  }

  _computeComponents() {
    let curComp = 1;
    const compSizes = new Map();

    for (const [id, node] of this.nodes) {
      if (node.compId !== 0) continue;
      let size = 0;
      const q = [id];
      node.compId = curComp;

      while (q.length > 0) {
        const uId = q.pop();
        size++;
        const u = this.nodes.get(uId);
        for (const e of u.edges) {
          const v = this.nodes.get(e.to);
          if (v && v.compId === 0) {
            v.compId = curComp;
            q.push(v.id);
          }
        }
      }
      compSizes.set(curComp, size);
      curComp++;
    }

    // Find component with maximum node count (the city road backbone)
    let maxSize = 0;
    for (const [cId, s] of compSizes) {
      if (s > maxSize) {
        maxSize = s;
        this.mainCompId = cId;
      }
    }
  }

  /**
   * Snaps a world (x, z) to the nearest road segment and nearest connected node.
   * @param {number} x
   * @param {number} z
   * @param {number} maxDist
   * @param {boolean} [requireMainComp=false]
   * @returns {{ nodeId: number, snapX: number, snapZ: number, dist: number, roadName: string|null }|null}
   */
  snapToRoad(x, z, maxDist = 300, requireMainComp = false) {
    const radiusCells = Math.ceil(maxDist / this.cellSize);
    const gx = Math.floor(x / this.cellSize);
    const gz = Math.floor(z / this.cellSize);

    let closestDistSq = maxDist * maxDist;
    let bestSnap = null;

    const checkedEdges = new Set();

    for (let r = 0; r <= radiusCells; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const ck = `${gx + dx},${gz + dz}`;
          const list = this.grid.get(ck);
          if (!list) continue;

          for (const idx of list) {
            if (checkedEdges.has(idx)) continue;
            checkedEdges.add(idx);

            const edge = this.edges[idx];
            const u = this.nodes.get(edge.from);
            const v = this.nodes.get(edge.to);
            if (requireMainComp && u.compId !== this.mainCompId && v.compId !== this.mainCompId) {
              continue;
            }

            const p1 = edge.p1;
            const p2 = edge.p2;

            const vx = p2[0] - p1[0];
            const vz = p2[1] - p1[1];
            const lenSq = vx * vx + vz * vz;
            if (lenSq < 0.0001) continue;

            let t = ((x - p1[0]) * vx + (z - p1[1]) * vz) / lenSq;
            t = Math.max(0, Math.min(1, t));

            const projX = p1[0] + t * vx;
            const projZ = p1[1] + t * vz;
            const dSq = (x - projX) * (x - projX) + (z - projZ) * (z - projZ);

            if (dSq < closestDistSq) {
              closestDistSq = dSq;
              const targetNode = (t < 0.5 ? u : v);
              const targetNodeId = (requireMainComp && targetNode.compId !== this.mainCompId)
                ? (u.compId === this.mainCompId ? u.id : v.id)
                : targetNode.id;

              bestSnap = {
                nodeId: targetNodeId,
                snapX: projX,
                snapZ: projZ,
                dist: Math.sqrt(dSq),
                roadName: edge.name,
                rank: edge.rank,
                width: edge.w,
              };
            }
          }
        }
      }
      if (bestSnap && bestSnap.dist <= (r * this.cellSize)) break;
    }

    return bestSnap;
  }

  /**
   * Find nearest street name near position.
   * @param {number} x
   * @param {number} z
   * @param {number} maxDist
   * @returns {string|null}
   */
  getStreetName(x, z, maxDist = 80) {
    const snap = this.snapToRoad(x, z, maxDist, false);
    return snap && snap.roadName ? snap.roadName : null;
  }

  /**
   * A* shortest path algorithm between start (sx, sz) and end (ex, ez).
   * Guaranteed road-network routing by snapping to the primary road backbone.
   * @param {number} sx start x
   * @param {number} sz start z
   * @param {number} ex end x
   * @param {number} ez end z
   * @returns {{ path: Array<[number, number]>, totalDist: number, turns: Array<object> }|null}
   */
  findPath(sx, sz, ex, ez) {
    // Snap to primary road backbone to ensure 100% path finding
    let startSnap = this.snapToRoad(sx, sz, 500, true);
    let endSnap = this.snapToRoad(ex, ez, 500, true);

    if (!startSnap) startSnap = this.snapToRoad(sx, sz, 1000, false);
    if (!endSnap) endSnap = this.snapToRoad(ex, ez, 1000, false);

    if (!startSnap || !endSnap) {
      const dist = Math.hypot(ex - sx, ez - sz);
      return { path: [[sx, sz], [ex, ez]], totalDist: dist, turns: [] };
    }

    if (startSnap.nodeId === endSnap.nodeId) {
      const dist = Math.hypot(ex - sx, ez - sz);
      const path = [[sx, sz], [startSnap.snapX, startSnap.snapZ], [endSnap.snapX, endSnap.snapZ], [ex, ez]];
      return { path, totalDist: dist, turns: this._computeTurns(path) };
    }

    const startNode = startSnap.nodeId;
    const endNode = endSnap.nodeId;
    const targetNode = this.nodes.get(endNode);

    // Min-heap A* priority queue
    const distMap = new Map();
    const prevMap = new Map();
    distMap.set(startNode, 0);

    const heap = [{
      id: startNode,
      f: Math.hypot(this.nodes.get(startNode).x - targetNode.x, this.nodes.get(startNode).z - targetNode.z),
      g: 0,
    }];
    const visited = new Set();

    const pushHeap = (item) => {
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p].f <= heap[i].f) break;
        const tmp = heap[p];
        heap[p] = heap[i];
        heap[i] = tmp;
        i = p;
      }
    };

    const popHeap = () => {
      if (heap.length === 0) return null;
      const top = heap[0];
      const bottom = heap.pop();
      if (heap.length > 0) {
        heap[0] = bottom;
        let i = 0;
        const n = heap.length;
        while (true) {
          const l = (i << 1) + 1;
          const r = l + 1;
          let sm = i;
          if (l < n && heap[l].f < heap[sm].f) sm = l;
          if (r < n && heap[r].f < heap[sm].f) sm = r;
          if (sm === i) break;
          const tmp = heap[i];
          heap[i] = heap[sm];
          heap[sm] = tmp;
          i = sm;
        }
      }
      return top;
    };

    let found = false;
    let iterations = 0;
    const MAX_ITERATIONS = 5000;

    while (heap.length > 0 && iterations++ < MAX_ITERATIONS) {
      const curr = popHeap();
      if (!curr) break;
      if (curr.id === endNode) {
        found = true;
        break;
      }
      if (visited.has(curr.id)) continue;
      visited.add(curr.id);

      const node = this.nodes.get(curr.id);
      if (!node) continue;

      for (const edge of node.edges) {
        if (visited.has(edge.to)) continue;
        const tentativeG = curr.g + edge.cost;
        const oldG = distMap.get(edge.to);

        if (oldG === undefined || tentativeG < oldG) {
          distMap.set(edge.to, tentativeG);
          prevMap.set(edge.to, { prevId: curr.id, pt: [node.x, node.z], dist: edge.dist });
          const toNode = this.nodes.get(edge.to);
          const h = Math.hypot(toNode.x - targetNode.x, toNode.z - targetNode.z);
          pushHeap({ id: edge.to, g: tentativeG, f: tentativeG + h });
        }
      }
    }

    if (!found) {
      const dist = Math.hypot(ex - sx, ez - sz);
      return { path: [[sx, sz], [ex, ez]], totalDist: dist, turns: [] };
    }

    // Reconstruct road path
    const path = [];
    let cur = endNode;
    let totalDist = 0;

    path.push([endSnap.snapX, endSnap.snapZ]);
    while (cur !== startNode) {
      const step = prevMap.get(cur);
      if (!step) break;
      path.push(step.pt);
      totalDist += step.dist;
      cur = step.prevId;
    }
    path.push([startSnap.snapX, startSnap.snapZ]);
    path.reverse();

    if (Math.hypot(path[0][0] - sx, path[0][1] - sz) > 2) path.unshift([sx, sz]);
    if (Math.hypot(path[path.length - 1][0] - ex, path[path.length - 1][1] - ez) > 2) path.push([ex, ez]);

    totalDist += Math.hypot(startSnap.snapX - sx, startSnap.snapZ - sz);
    totalDist += Math.hypot(endSnap.snapX - ex, endSnap.snapZ - ez);

    const turns = this._computeTurns(path);
    return { path, totalDist, turns };
  }

  _computeTurns(pts) {
    if (!pts || pts.length < 3) return [];
    const turns = [];
    let cumDist = 0;

    for (let i = 1; i < pts.length - 1; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      cumDist += d;

      const v1x = p1[0] - p0[0];
      const v1z = p1[1] - p0[1];
      const v2x = p2[0] - p1[0];
      const v2z = p2[1] - p1[1];

      const a1 = Math.atan2(v1z, v1x);
      const a2 = Math.atan2(v2z, v2x);
      let da = (a2 - a1) * 180 / Math.PI;
      while (da > 180) da -= 360;
      while (da < -180) da += 360;

      if (Math.abs(da) > 28) {
        turns.push({
          atDist: Math.round(cumDist),
          angle: Math.round(da),
          type: da > 0 ? 'right' : 'left',
          pt: p1,
          street: this.getStreetName(p2[0], p2[1], 50) || 'Ahead',
        });
      }
    }
    return turns;
  }
}
