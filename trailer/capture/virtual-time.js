// Injected into the game page before any game code runs (Playwright addInitScript).
//
// The game keeps its own real-time requestAnimationFrame loops (src/main.js and
// src/drive.js), both timed off performance.now(). Recording that in real time
// drops frames whenever a frame is slow. Instead this shim lets the capture
// harness take over the clock: after __vt.takeover(), time only moves when
// __vt.step() is called, exactly 1/fps per step, and every queued rAF callback
// runs once per step. The game sees a perfect 60 fps no matter how long a frame
// really takes, so the footage is smooth and repeatable. No game file changes.
(() => {
  const realNow = performance.now.bind(performance);
  const realDateNow = Date.now.bind(Date);
  const realRAF = window.requestAnimationFrame.bind(window);
  const realCAF = window.cancelAnimationFrame.bind(window);

  let virtual = false;
  let vnow = 0;          // virtual performance.now(), ms
  let dateOffset = 0;    // Date.now() - performance.now() at takeover
  let stepMs = 1000 / 60;
  let nextId = 1;
  let queue = [];        // [{ id, cb }] waiting for the next step
  const cancelled = new Set();

  performance.now = () => (virtual ? vnow : realNow());
  Date.now = () => (virtual ? Math.round(vnow + dateOffset) : realDateNow());

  window.requestAnimationFrame = (cb) => {
    const id = nextId++;
    if (virtual) {
      queue.push({ id, cb });
    } else {
      // Registered in real time; if the takeover happens before it fires, it
      // joins the virtual queue instead of running on the real clock.
      realRAF((ts) => {
        if (cancelled.delete(id)) return;
        if (virtual) queue.push({ id, cb });
        else cb(ts);
      });
    }
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    cancelled.add(id);
    queue = queue.filter((entry) => entry.id !== id);
  };

  // Deterministic Math.random so traffic, pedestrians and weather repeat
  // between runs of the same shot (mulberry32). Reseeded per shot.
  let seed = 0x9e3779b9;
  const seededRandom = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = seededRandom;

  // Pointer lock can never be held by an automated page, and losing it opens
  // the pause menu (src/main.js 'modechange'), which blocks player.update().
  Element.prototype.requestPointerLock = function requestPointerLock() { return Promise.resolve(); };

  window.__vt = {
    get virtual() { return virtual; },
    get now() { return vnow; },
    reseed(value) { seed = value | 0; },
    takeover(fps = 60) {
      if (virtual) return;
      stepMs = 1000 / fps;
      vnow = realNow();
      dateOffset = realDateNow() - vnow;
      virtual = true;
    },
    /** Advance one frame: run every callback that was queued before this step. */
    step() {
      vnow += stepMs;
      const batch = queue;
      queue = [];
      for (const { id, cb } of batch) {
        if (cancelled.delete(id)) continue;
        try { cb(vnow); } catch (err) { console.error('[vt] rAF callback threw', err); }
      }
    },
  };
})();
