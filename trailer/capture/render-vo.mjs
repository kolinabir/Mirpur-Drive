// Voice-over: one WAV per script line, from Kokoro-82M (open weights, Apache-2.0),
// run locally through kokoro-js. First run downloads the ONNX model (~90 MB, q8)
// from Hugging Face into node_modules/.cache. Output is a scratch VO: drop your
// own recordings over public/audio/vo/NN.wav and re-run with --measure to refresh
// the durations the edit uses for captions and music ducking.
//   node capture/render-vo.mjs [--voice af_heart] [--measure]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const script = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'script.json'), 'utf8'));
const outDir = path.join(ROOT, 'public', 'audio', 'vo');
fs.mkdirSync(outDir, { recursive: true });

/** Duration of a PCM WAV from its header. */
function wavSeconds(file) {
  const buf = fs.readFileSync(file);
  const byteRate = buf.readUInt32LE(28);
  const dataAt = buf.indexOf('data', 12, 'latin1');
  return buf.readUInt32LE(dataAt + 4) / byteRate;
}

if (!args.includes('--measure')) {
  const { KokoroTTS } = await import('kokoro-js');
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
  const voice = opt('voice', script.voice);
  for (const line of script.lines) {
    const audio = await tts.generate(line.text, { voice, speed: Number(opt('speed', script.speed)) });
    await audio.save(path.join(outDir, `${line.id}.wav`));
    console.log(line.id, voice, JSON.stringify(line.text));
  }
}

const manifest = {};
for (const line of script.lines) {
  const file = path.join(outDir, `${line.id}.wav`);
  if (fs.existsSync(file)) manifest[line.id] = { file: `audio/vo/${line.id}.wav`, seconds: +wavSeconds(file).toFixed(3) };
}
fs.writeFileSync(path.join(ROOT, 'src', 'vo-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(manifest);
