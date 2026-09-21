// Shared capture plumbing: launch Chrome, boot the game, take over its clock,
// and receive frames over a local HTTP endpoint (binary, no base64 round trip).
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
// The capture never points at the shared Vite dev server: any file change in
// the checkout (other sessions work here too) reloads the page mid-take.
// Instead it serves a frozen production build: `npm run game:build`.
export const GAME_BUILD = path.join(ROOT, '.cache', 'game');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ktx2': 'image/ktx2', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon', '.txt': 'text/plain', '.md': 'text/markdown' };

/** Static server for the frozen build. Returns { url, close }. */
export function serveGame() {
  if (process.env.MIRPUR_URL) return Promise.resolve({ url: process.env.MIRPUR_URL, close: async () => {} });
  if (!fs.existsSync(path.join(GAME_BUILD, 'index.html'))) throw new Error('no frozen game build: run `npm run game:build` in trailer/ first');
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(GAME_BUILD, rel);
    if (!file.startsWith(GAME_BUILD)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((done) => server.close(done)),
  })));
}

// CSS viewport per format. deviceScaleFactor 1.5 is the game's own pixel-ratio
// cap (src/main.js PIXEL_RATIO_MAX), so the canvas is 2880x1620 / 1620x2880:
// a 1.5x supersample that is scaled down to 1080p at render time.
export const FORMATS = {
  wide: { width: 1920, height: 1080 },
  tall: { width: 1080, height: 1920 },
};
export const SCALE = Number(process.env.CAPTURE_SCALE || 1.5);

export async function launchGame({ format = 'wide', scene = null, query = '', headless = false, debugPort = null } = {}) {
  const viewport = FORMATS[format];
  if (!viewport) throw new Error(`unknown format ${format}`);
  const browser = await chromium.launch({
    channel: 'chrome',
    headless,
    args: [
      '--mute-audio',
      '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--autoplay-policy=no-user-gesture-required',
      `--window-size=${viewport.width},${viewport.height + 90}`,
      ...(debugPort ? [`--remote-debugging-port=${debugPort}`] : []),
    ],
  });
  const context = await browser.newContext({ viewport, deviceScaleFactor: SCALE });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.error('[page error]', err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[page console]', msg.text().slice(0, 300));
  });
  await page.addInitScript({ path: path.join(HERE, 'virtual-time.js') });

  // aa=1 forces MSAA on top of the supersample; res=fixed stops the perf
  // governor from trading resolution for frame rate (irrelevant offline).
  const params = new URLSearchParams(`aa=1&res=fixed${query ? `&${query}` : ''}`);
  if (scene) params.set('scene', scene);
  const game = await serveGame();
  await page.goto(`${game.url}/?${params}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__mirpur && window.__mirpur.monsoon && !document.getElementById('start').classList.contains('hidden'), null, { timeout: 180_000 });
  await page.click('#begin-direct');
  await page.waitForFunction(() => window.__mirpur.drive && window.__driveDebug, null, { timeout: 60_000 });
  await page.addScriptTag({ path: path.join(HERE, 'page-shots.js') });
  return { browser, context, page, viewport, game };
}

/** GPU sanity check: software rendering would make the capture pointless. */
export async function gpuInfo(page) {
  return page.evaluate(() => {
    const gl = window.__mirpur.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const canvas = window.__mirpur.renderer.domElement;
    return {
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
      canvas: `${canvas.width}x${canvas.height}`,
      samples: gl.getParameter(gl.SAMPLES),
    };
  });
}

/** Local endpoint the page POSTs JPEG frames to. Returns { port, close, count }. */
export function frameServer(dir) {
  fs.mkdirSync(dir, { recursive: true });
  let count = 0;
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    const name = path.basename(req.url || '');
    if (req.method !== 'POST' || !/^[\w.-]+\.(jpg|png)$/.test(name)) { res.writeHead(400).end(); return; }
    const out = fs.createWriteStream(path.join(dir, name));
    req.pipe(out);
    out.on('finish', () => { count++; res.writeHead(200).end('ok'); });
    out.on('error', () => res.writeHead(500).end());
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      port: server.address().port,
      get count() { return count; },
      close: () => new Promise((done) => server.close(done)),
    }));
  });
}
