import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLOR, FONT } from '../theme';
import type { Format } from '../timeline';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Final 8 s: title, the one thing to do (the link), and where the source lives. Frame 0 = card start. */
export const EndCard = ({ format, playUrl, repoUrl, length }: { format: Format; playUrl: string; repoUrl: string; length: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tall = format === 'tall';
  const shade = interpolate(frame, [0, 30], [0, 0.72], clamp);
  const title = spring({ frame: frame - 14, fps, config: { damping: 18, stiffness: 140, mass: 0.8 } });
  const rise = (from: number) => interpolate(frame, [from, from + 22], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const bn = rise(40);
  const tag = rise(70);
  const url = rise(100);
  const repo = rise(150);
  // The card holds to the last frame: people pause on it to read the link.
  const fadeOut = interpolate(frame, [length - 1, length], [1, 1], clamp);
  const lift = (k: number) => ({ opacity: k, transform: `translateY(${interpolate(k, [0, 1], [24, 0])}px)` });

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: COLOR.ink, opacity: shade }} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: tall ? '0 60px' : 0, top: tall ? '-4%' : 0, opacity: fadeOut }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 26, opacity: title }}>
          <div style={{ width: tall ? 90 : 120, height: 8, backgroundColor: COLOR.green }} />
          <div style={{ width: tall ? 90 : 120, height: 8, backgroundColor: COLOR.red }} />
        </div>
        <div
          style={{
            fontFamily: FONT.display,
            fontSize: tall ? 190 : 230,
            lineHeight: 1,
            color: COLOR.white,
            letterSpacing: interpolate(title, [0, 1], [30, 4]),
            opacity: Math.min(title * 1.3, 1),
            transform: `scale(${interpolate(title, [0, 1], [1.12, 1])})`,
          }}
        >
          MIRPUR DRIVE
        </div>
        <div style={{ fontFamily: FONT.bangla, fontWeight: 700, fontSize: tall ? 70 : 80, color: 'rgba(255,255,255,0.92)', marginTop: 6, ...lift(bn) }}>মিরপুর ড্রাইভ</div>
        <div style={{ fontFamily: FONT.text, fontWeight: 500, fontSize: tall ? 38 : 40, letterSpacing: 6, color: 'rgba(255,255,255,0.8)', marginTop: tall ? 56 : 48, textTransform: 'uppercase', ...lift(tag) }}>
          Play free in your browser
        </div>
        <div
          style={{
            fontFamily: FONT.text,
            fontWeight: 700,
            fontSize: tall ? 52 : 60,
            color: COLOR.ink,
            backgroundColor: COLOR.white,
            padding: tall ? '18px 34px' : '18px 44px',
            borderRadius: 14,
            marginTop: 28,
            ...lift(url),
          }}
        >
          {playUrl}
        </div>
        <div style={{ fontFamily: FONT.text, fontWeight: 500, fontSize: tall ? 30 : 30, color: 'rgba(255,255,255,0.66)', marginTop: tall ? 60 : 50, ...lift(repo) }}>
          Open source · {repoUrl}
        </div>
        <div style={{ fontFamily: FONT.text, fontWeight: 500, fontSize: tall ? 26 : 26, color: 'rgba(255,255,255,0.5)', marginTop: 12, ...lift(repo) }}>
          Real streets and buildings from OpenStreetMap
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
