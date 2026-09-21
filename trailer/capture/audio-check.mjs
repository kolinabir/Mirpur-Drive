// Sanity check of a rendered trailer's soundtrack without listening to it:
// peak level (clipping?) and loudness per 2 s bar (is the VO there, does the music duck?).
//   node capture/audio-check.mjs out/mirpur-drive-trailer-16x9.mp4
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './lib.mjs';

const input = path.resolve(process.argv[2]);
const wav = path.join(os.tmpdir(), `trailer-audio-${process.pid}.wav`);
execFileSync('npx', ['remotion', 'ffmpeg', '-y', '-loglevel', 'error', '-i', input, '-vn', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', wav], { cwd: ROOT });
const buf = fs.readFileSync(wav);
fs.rmSync(wav);
const dataAt = buf.indexOf('data', 12, 'latin1') + 8;
const samples = new Int16Array(buf.buffer, buf.byteOffset + dataAt, Math.floor((buf.length - dataAt) / 2));
let peak = 0;
for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
const seconds = samples.length / 2 / 48000;
const rows = [];
for (let t = 0; t < seconds; t += 2) {
  let sum = 0, n = 0;
  for (let i = Math.floor(t * 48000) * 2; i < Math.floor((t + 2) * 48000) * 2 && i < samples.length; i++) { sum += (samples[i] / 32768) ** 2; n++; }
  rows.push(`${String(t).padStart(2)}s ${(10 * Math.log10(sum / n + 1e-12)).toFixed(1)} dB`);
}
console.log(`duration ${seconds.toFixed(2)} s, peak ${(20 * Math.log10(peak / 32768)).toFixed(2)} dBFS`);
console.log(rows.join(' | '));
process.exit(0);
