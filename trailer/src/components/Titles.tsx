import { AbsoluteFill, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLOR, FONT } from '../theme';
import type { Format } from '../timeline';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** One huge word, slammed in on the beat. */
const Word = ({ text, length, format }: { text: string; length: number; format: Format }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 220, mass: 0.6 } });
  const out = interpolate(frame, [length - 12, length], [1, 0], clamp);
  const size = format === 'tall' ? 300 : 380;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', top: format === 'tall' ? '-12%' : 0 }}>
      <div
        style={{
          fontFamily: FONT.display,
          fontSize: size,
          lineHeight: 1,
          color: COLOR.white,
          letterSpacing: interpolate(pop, [0, 1], [40, 6]),
          transform: `scale(${interpolate(pop, [0, 1], [1.35, 1])})`,
          opacity: Math.min(pop * 1.4, 1) * out,
          textShadow: '0 8px 40px rgba(0,0,0,0.55)',
        }}
      >
        {text}
      </div>
      <div style={{ width: interpolate(pop, [0, 1], [0, size * 0.9]) * out, height: 10, marginTop: 18, backgroundColor: COLOR.red, opacity: out }} />
    </AbsoluteFill>
  );
};

export const Words = ({ words, format }: { words: { at: number; length: number; text: string }[]; format: Format }) => (
  <>
    {words.map((w) => (
      <Sequence key={w.at} from={w.at} durationInFrames={w.length} name={`word ${w.text}`}>
        <Word text={w.text} length={w.length} format={format} />
      </Sequence>
    ))}
  </>
);

/** Lower third: accent bar, place name, Bangla name from the game. */
const Place = ({ name, bn, length, format }: { name: string; bn?: string; length: number; format: Format }) => {
  const frame = useCurrentFrame();
  const inn = interpolate(frame, [0, 18], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const out = interpolate(frame, [length - 14, length], [1, 0], clamp);
  const tall = format === 'tall';
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', padding: tall ? '0 64px 30%' : '0 96px 92px' }}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 22, opacity: inn * out, transform: `translateX(${interpolate(inn, [0, 1], [-40, 0])}px)` }}>
        <div style={{ width: 8, backgroundColor: COLOR.green, transform: `scaleY(${inn})`, transformOrigin: 'bottom' }} />
        <div style={{ textShadow: '0 2px 18px rgba(0,0,0,0.75)' }}>
          <div style={{ fontFamily: FONT.text, fontWeight: 700, fontSize: tall ? 40 : 44, letterSpacing: 1.5, color: COLOR.white, textTransform: 'uppercase', maxWidth: tall ? 880 : 1300 }}>{name}</div>
          {bn ? <div style={{ fontFamily: FONT.bangla, fontWeight: 500, fontSize: tall ? 36 : 38, color: 'rgba(255,255,255,0.88)', marginTop: 4 }}>{bn}</div> : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Places = ({ places, format }: { places: { at: number; length: number; name: string; bn?: string }[]; format: Format }) => (
  <>
    {places.map((p) => (
      <Sequence key={p.at} from={p.at} durationInFrames={p.length} name={`place ${p.name}`}>
        <Place {...p} format={format} />
      </Sequence>
    ))}
  </>
);

/** Statements that stack up over the montage, one per bar. */
export const Claims = ({ claims, end, format }: { claims: { at: number; text: string }[]; end: number; format: Format }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < claims[0].at || frame >= end) return null;
  const out = interpolate(frame, [end - 10, end], [1, 0], clamp);
  const tall = format === 'tall';
  return (
    <AbsoluteFill style={{ justifyContent: 'center', padding: tall ? '0 64px' : '0 120px', top: tall ? '-8%' : 0, opacity: out }}>
      {claims.map((c, i) => {
        const pop = spring({ frame: frame - c.at, fps, config: { damping: 16, stiffness: 240, mass: 0.5 } });
        const shown = frame >= c.at;
        const last = i === claims.length - 1;
        return (
          // Lines that have not landed yet still take their space, so the stack never jumps.
          <div
            key={c.at}
            style={{
              fontFamily: FONT.display,
              fontSize: tall ? 132 : 160,
              lineHeight: 1.16,
              marginBottom: tall ? 14 : 16,
              color: last ? COLOR.ink : COLOR.white,
              visibility: shown ? 'visible' : 'hidden',
              transform: `translateX(${interpolate(pop, [0, 1], [-60, 0])}px)`,
              opacity: Math.min(pop * 1.5, 1),
              textShadow: last ? 'none' : '0 6px 30px rgba(0,0,0,0.6)',
            }}
          >
            <span style={last ? { backgroundColor: COLOR.white, padding: '0 22px', display: 'inline-block' } : undefined}>{c.text}</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
