import { AbsoluteFill, Sequence } from 'remotion';
import { AudioMix } from './components/AudioMix';
import { Captions, type Line } from './components/Captions';
import { EndCard } from './components/EndCard';
import { FadeFromBlack, Flash, Footage, Grade } from './components/Footage';
import { Claims, Places, Words } from './components/Titles';
import script from './script.json';
import voManifest from './vo-manifest.json';
import { BAR, CLAIMS, CLAIMS_END, CLIPS, END_CARD_AT, PLACES, PLAY_URL, REPO_URL, TOTAL_FRAMES, WORDS, type Format } from './timeline';

export type TrailerProps = {
  format: Format;
  /** Burned-in voice-over subtitles (on for 9:16, where most views are muted). */
  captions: boolean;
  musicVolume: number;
  voVolume: number;
};

export const trailerSchemaDefaults = { musicVolume: 1, voVolume: 1 };

const manifest = voManifest as Record<string, { file: string; seconds: number }>;
const LINES: Line[] = script.lines.filter((l) => manifest[l.id]).map((l) => ({ ...l, seconds: manifest[l.id].seconds }));

export const Trailer = ({ format, captions, musicVolume, voVolume }: TrailerProps) => (
  <AbsoluteFill style={{ backgroundColor: '#000' }}>
    <Footage clips={CLIPS} format={format} />
    <Grade />
    <Flash at={[BAR * 6, BAR * 21, END_CARD_AT]} />
    <Places places={PLACES} format={format} />
    <Words words={WORDS} format={format} />
    <Claims claims={CLAIMS} end={CLAIMS_END} format={format} />
    <Sequence from={END_CARD_AT} name="end card">
      <EndCard format={format} playUrl={PLAY_URL} repoUrl={REPO_URL} length={TOTAL_FRAMES - END_CARD_AT} />
    </Sequence>
    {captions ? <Captions lines={LINES} format={format} /> : null}
    <FadeFromBlack frames={50} />
    <AudioMix lines={LINES} musicVolume={musicVolume} voVolume={voVolume} />
  </AbsoluteFill>
);
