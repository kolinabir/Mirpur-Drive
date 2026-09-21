import { AbsoluteFill, Freeze, OffthreadVideo, staticFile } from 'remotion';
import type { Format } from './timeline';

export type SheetProps = { src: string; format: Format; every: number; cells: number; cols: number; start?: number };

/** Review tool: a grid of frames from one footage clip, labelled with the source frame number. */
export const Sheet = ({ src, format, every, cells, cols, start = 0 }: SheetProps) => (
  <AbsoluteFill style={{ backgroundColor: '#111', display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 4 }}>
    {Array.from({ length: cells }, (_, i) => (
      <div key={i} style={{ position: 'relative', overflow: 'hidden' }}>
        <Freeze frame={start + i * every}>
          <OffthreadVideo muted src={staticFile(`footage/${format}/${src}.mp4`)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </Freeze>
        <span style={{ position: 'absolute', left: 6, top: 4, font: '700 22px monospace', color: '#fff', background: '#000a', padding: '0 6px' }}>{start + i * every}</span>
      </div>
    ))}
  </AbsoluteFill>
);
