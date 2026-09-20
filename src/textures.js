/**
 * textures.js
 *
 * Loads the real photographic PBR textures collected under public/textures/
 * (see MANIFEST.json and LICENSES.md there — all CC0, from ambientCG).
 *
 * Exposes:
 *   - loadTextureSet(name, { normalise }): Promise<{ map, normalMap, roughnessMap, aoMap }>
 *   - preloadAll(): Promise<Record<string, TextureSet>>
 *
 * Color maps get SRGBColorSpace; normal/roughness/AO stay linear (default).
 * All maps get RepeatWrapping and anisotropy 8. A missing map for a given
 * material (not every asset shipped an AO map) resolves to `undefined`
 * rather than throwing.
 *
 * P11-H albedo normalisation: pass `{ normalise: true }` to get a colour
 * map whose mean has been scaled toward white (see `normaliseColorMap`
 * below), so a caller's honest, documented tint (chosen as the intended
 * FINAL on-screen colour) survives being multiplied by the map in
 * MeshStandardMaterial instead of being crushed dark or clipped bright by
 * a mid-grey photographic albedo. Normal/roughness/AO maps are never
 * normalised — only the colour map carries overall brightness level, the
 * others encode geometry/microsurface detail that must stay as shot.
 */

import * as THREE from 'three';

// Vite serves public/ at the site root, so the assets live at /textures/...
// (new URL('../public/...', import.meta.url) resolved to a broken /@fs/ path
// and every load silently failed; advisor fix 2026-09-07.)
const MANIFEST_URL = '/textures/MANIFEST.json';
const BASE_URL = '/textures/';

let manifestPromise = null;
// P11-C (docs/briefs/P11-C-ENV-AND-TEXTURE-SHARING.md), finding 2: this used
// to cache the resolved {map, normalMap, roughnessMap, aoMap} set itself, so
// every caller got the exact same THREE.Texture instances. metro.js's
// wireTexture then mutates `.repeat` on them for tiling, while interior.js's
// texMat uses the same slugs with baked metric UVs and expects repeat=(1,1)
// — so whichever caller ran last won the shared `.repeat`. Now this caches
// only the decoded/uploaded originals (one network fetch + decode per slug,
// same as before); loadTextureSet() below hands back a fresh per-call clone
// so no caller can step on another caller's `.repeat`/`.offset`.
const rawCache = new Map();

// P11-H: normalised colour-map variants, cached separately from `rawCache`
// and keyed on `slug` (there is only one normalised variant per slug — the
// "target" level is a fixed constant below, not a per-caller option) so a
// slug's mean-scaling work happens once no matter how many materials
// request `{ normalise: true }`. Holds a Promise<THREE.CanvasTexture> (the
// canonical normalised texture, NOT yet cloned for a caller) or `undefined`
// for a slug with no colour map.
const normalisedCache = new Map();

const manager = new THREE.LoadingManager();
const loader = new THREE.TextureLoader(manager);

// A photographic albedo should supply *variation*, not overall brightness
// level — the actual level should come from the tint the material author
// chose. TARGET_MEAN is how bright (0-1 of full white) the normalised map's
// mean lands on; left below 1.0 so bright speckle in the photo still has
// headroom to clip instead of everything pinning to white.
const NORMALISE_TARGET_MEAN = 0.9;

/**
 * Build a colour map whose mean has been scaled toward `NORMALISE_TARGET_MEAN`
 * so that `tint x map` lands close to `tint` (the photo's own detail riding
 * on top as variation) instead of `tint x map's own (much darker) mean`.
 *
 * Scales every pixel by a SINGLE luminance-derived factor (never per
 * channel) — a per-channel rescale is what caused the hue shift this brief
 * exists to fix (P11-B/P11-D's brick going salmon-pink), because it changes
 * the ratio between channels, not just their shared level.
 */
function normaliseColorMap(tex) {
  if (!tex || !tex.image) return undefined;
  const img = tex.image;
  const w = img.width;
  const h = img.height;
  if (!w || !h) return undefined;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Per-channel means first, then combine into one perceptual luminance —
  // the factor derived from that single number is what gets applied to
  // every channel alike, which is what keeps hue (the R:G:B ratio) intact.
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  const pixelCount = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    sumR += data[i];
    sumG += data[i + 1];
    sumB += data[i + 2];
  }
  const meanR = sumR / pixelCount;
  const meanG = sumG / pixelCount;
  const meanB = sumB / pixelCount;
  const meanLuminance = 0.2126 * meanR + 0.7152 * meanG + 0.0722 * meanB;

  const targetLevel = NORMALISE_TARGET_MEAN * 255;
  const factor = meanLuminance > 0 ? targetLevel / meanLuminance : 1;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, data[i] * factor);
    data[i + 1] = Math.min(255, data[i + 1] * factor);
    data[i + 2] = Math.min(255, data[i + 2] * factor);
    // alpha (data[i + 3]) untouched
  }
  ctx.putImageData(imageData, 0, 0);

  const out = new THREE.CanvasTexture(canvas);
  out.wrapS = tex.wrapS;
  out.wrapT = tex.wrapT;
  out.anisotropy = tex.anisotropy;
  out.colorSpace = tex.colorSpace;
  out.needsUpdate = true;
  return out;
}

function fetchManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load texture manifest: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        const byslug = new Map();
        for (const entry of json.materials || []) {
          byslug.set(entry.slug, entry);
        }
        return byslug;
      });
  }
  return manifestPromise;
}

function loadOne(path, { srgb = false } = {}) {
  if (!path) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    loader.load(
      BASE_URL + path,
      (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        // Color maps benefit from high anisotropy (8) for crisp
        // ground/wall textures at oblique angles. Normal/roughness/AO
        // carry low-frequency detail where 4 is visually identical but
        // cheaper on fill rate.
        tex.anisotropy = srgb ? 8 : 4;
        if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        resolve(tex);
      },
      undefined,
      () => resolve(undefined) // missing/broken map -> undefined, not a throw
    );
  });
}

function loadRawSet(name) {
  if (rawCache.has(name)) return rawCache.get(name);

  const promise = (async () => {
    const manifest = await fetchManifest();
    const entry = manifest.get(name);
    if (!entry) {
      console.warn(`[textures] Unknown texture set "${name}"`);
      return {};
    }
    const [map, normalMap, roughnessMap, aoMap] = await Promise.all([
      loadOne(entry.maps.color, { srgb: true }),
      loadOne(entry.maps.normal),
      loadOne(entry.maps.roughness),
      loadOne(entry.maps.ao),
    ]);
    return { map, normalMap, roughnessMap, aoMap };
  })();

  rawCache.set(name, promise);
  return promise;
}

// Texture.prototype.copy() (what clone() calls) points the clone's `.source`
// at the SAME Source/image as the original — so cloning is free of any extra
// decode or GPU memory for the pixel data — but it also sets the clone's
// needsUpdate=true and copies wrapS/wrapT/anisotropy/colorSpace across for
// us, which is exactly the per-caller isolation finding 2 asks for.
function cloneTex(tex) {
  return tex ? tex.clone() : undefined;
}

// Lazily builds (once per slug, regardless of caller count) and caches the
// canonical normalised colour-map texture, keyed on `slug + variant` (there
// is currently one variant, 'normalised') per the brief. Returns a Promise
// resolving to the canonical THREE.CanvasTexture (or undefined) — callers
// must still clone it (see loadTextureSet) for their own `.repeat`/`.offset`.
function getNormalisedMap(name, rawMap) {
  const cacheKey = `${name}::normalised`;
  if (!normalisedCache.has(cacheKey)) {
    normalisedCache.set(cacheKey, Promise.resolve(normaliseColorMap(rawMap)));
  }
  return normalisedCache.get(cacheKey);
}

/**
 * Load one named material's texture set (color/normal/roughness/ao).
 * `name` is the manifest slug, e.g. "plaster-weathered-1".
 *
 * Each call returns its OWN Texture instances (sharing the underlying
 * decoded image with every other caller of the same slug, but each with its
 * own `.repeat`/`.offset`), so metro.js can tile a shared slug via
 * `.repeat.set()` without disturbing interior.js's un-tiled UVs on the same
 * slug, or any other caller.
 *
 * Pass `{ normalise: true }` to get a colour map whose mean has been scaled
 * toward white (see `normaliseColorMap`) instead of the raw photographic
 * mean — normal/roughness/ao maps are unaffected either way (never
 * normalised). The normalised variant is computed once per slug and cached
 * separately from the raw one (`slug + variant` cache key), then cloned per
 * caller same as the raw path, so P11-C's per-caller `.repeat`/`.offset`
 * isolation still holds.
 * @returns {Promise<{map?: THREE.Texture, normalMap?: THREE.Texture, roughnessMap?: THREE.Texture, aoMap?: THREE.Texture}>}
 */
export async function loadTextureSet(name, { normalise = false } = {}) {
  const raw = await loadRawSet(name);
  const map = normalise ? cloneTex(await getNormalisedMap(name, raw.map)) : cloneTex(raw.map);
  return {
    map,
    normalMap: cloneTex(raw.normalMap),
    roughnessMap: cloneTex(raw.roughnessMap),
    aoMap: cloneTex(raw.aoMap),
  };
}

/**
 * Preload every material listed in the manifest. Handy to warm the cache
 * (and the browser's HTTP cache) before the facade atlas is built.
 *
 * Uses loadRawSet() rather than loadTextureSet() — this only needs to warm
 * the decode/HTTP cache, not hand out isolated instances nobody will use, so
 * there's no reason to pay for a throwaway clone + GPU upload per slug here.
 * @returns {Promise<Record<string, Awaited<ReturnType<typeof loadTextureSet>>>>}
 */
export async function preloadAll() {
  const manifest = await fetchManifest();
  const names = Array.from(manifest.keys());
  const sets = await Promise.all(names.map((name) => loadRawSet(name)));
  const out = {};
  names.forEach((name, i) => {
    out[name] = sets[i];
  });
  return out;
}
