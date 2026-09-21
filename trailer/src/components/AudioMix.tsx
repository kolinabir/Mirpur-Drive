import { Audio, Sequence, interpolate, staticFile, useVideoConfig } from 'remotion';
import type { Line } from './Captions';

// Measured: the music sits near -13 dB RMS in the loud sections and the voice near -20 dB.
// Ducking to 0.2 (-14 dB) and lifting the voice 2.3 dB keeps speech about 10 dB clear of the bed.
const MUSIC = 0.82;
const DUCKED = 0.2;
const VO_GAIN = 1.3;
const RAMP = 0.28; // seconds

/** Music under everything, dipped while a voice-over line plays. */
export const AudioMix = ({ lines, musicVolume, voVolume }: { lines: Line[]; musicVolume: number; voVolume: number }) => {
  const { fps } = useVideoConfig();
  const duck = (frame: number) => {
    const t = frame / fps;
    let level = MUSIC;
    for (const l of lines) {
      const k = interpolate(t, [l.at - RAMP, l.at, l.at + l.seconds, l.at + l.seconds + RAMP * 1.6], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      level = Math.min(level, MUSIC + (DUCKED - MUSIC) * k);
    }
    return level * musicVolume;
  };
  return (
    <>
      <Audio src={staticFile('audio/music.wav')} volume={duck} />
      {lines.map((l) => (
        <Sequence key={l.id} from={Math.round(l.at * fps)} name={`vo ${l.id}`}>
          <Audio src={staticFile(`audio/vo/${l.id}.wav`)} volume={voVolume * VO_GAIN} />
        </Sequence>
      ))}
    </>
  );
};
