// Shot-design session: boots the game once with the virtual clock taken over
// and keeps Chrome open on a CDP port, so capture/eval.mjs can poke it without
// paying the ~40 s world load each time.
//   node capture/serve.mjs [--format wide|tall] [--scene bijoy]
import { launchGame, gpuInfo } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const { page } = await launchGame({ format: opt('format', 'wide'), scene: opt('scene', null), debugPort: Number(opt('port', 9333)) });
console.log('gpu', await gpuInfo(page));
await page.evaluate(() => { window.__vt.takeover(60); window.__cap.hideLabels(); });
console.log('READY');
await new Promise(() => {});
