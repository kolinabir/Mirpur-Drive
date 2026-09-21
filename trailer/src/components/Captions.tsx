import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT } from '../theme';
import type { Format } from '../timeline';

export type Line = { id: string; at: number; text: string; seconds: number };

/** Burned-in subtitles for the voice-over. One line at a time, timed from the WAV lengths. */
export const Captions = ({ lines, format }: { lines: Line[]; format: Format }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const line = lines.find((l) => t >= l.at - 0.05 && t <= l.at + l.seconds + 0.25);
  if (!line) return null;
  const local = t - line.at;
  const opacity = interpolate(local, [-0.05, 0.12, line.seconds + 0.05, line.seconds + 0.25], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const tall = format === 'tall';
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', padding: tall ? '0 70px 21%' : '0 200px 40px' }}>
      <div
        style={{
          fontFamily: FONT.text,
          fontWeight: 700,
          fontSize: tall ? 46 : 38,
          lineHeight: 1.25,
          color: '#fff',
          textAlign: 'center',
          backgroundColor: 'rgba(8,12,11,0.72)',
          padding: tall ? '14px 26px' : '10px 22px',
          borderRadius: 12,
          opacity,
          maxWidth: tall ? 900 : 1300,
        }}
      >
        {line.text}
      </div>
    </AbsoluteFill>
  );
};
