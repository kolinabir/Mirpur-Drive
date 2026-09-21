import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import type { Clip, Format } from '../timeline';

const ClipView = ({ clip, format }: { clip: Clip; format: Format }) => {
  const frame = useCurrentFrame();
  const tall = format === 'tall';
  const scale = interpolate(frame, [0, clip.length], [1, clip.zoomTo ?? 1], { extrapolateRight: 'clamp' }) * (tall ? clip.tallScale ?? 1 : 1);
  return (
    <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: tall ? clip.tallOrigin ?? 'center' : 'center' }}>
      <OffthreadVideo
        muted
        src={staticFile(`footage/${format}/${clip.src}.mp4`)}
        trimBefore={tall ? clip.fromTall ?? clip.from : clip.from}
        playbackRate={clip.playbackRate ?? 1}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </AbsoluteFill>
  );
};

export const Footage = ({ clips, format }: { clips: Clip[]; format: Format }) => (
  <AbsoluteFill style={{ backgroundColor: '#000' }}>
    {clips.map((clip, i) => (
      <Sequence key={i} from={clip.at} durationInFrames={clip.length} premountFor={30} name={`${clip.src} @${clip.from}`}>
        <ClipView clip={clip} format={format} />
      </Sequence>
    ))}
  </AbsoluteFill>
);

/** Soft vignette plus a bottom shade so type stays readable over bright streets. */
export const Grade = () => (
  <AbsoluteFill
    style={{
      background:
        'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.38) 100%), linear-gradient(to top, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0) 32%)',
    }}
  />
);

/** A short white flash on the big musical hits. */
export const Flash = ({ at }: { at: number[] }) => {
  const frame = useCurrentFrame();
  const opacity = at.reduce((acc, t) => Math.max(acc, interpolate(frame, [t - 1, t, t + 14], [0, 0.55, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })), 0);
  return opacity > 0 ? <AbsoluteFill style={{ backgroundColor: '#fff', opacity }} /> : null;
};

export const FadeFromBlack = ({ frames }: { frames: number }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, frames], [1, 0], { extrapolateRight: 'clamp' });
  return opacity > 0 ? <AbsoluteFill style={{ backgroundColor: '#000', opacity }} /> : null;
};
