import { Composition } from 'remotion';
import { Trailer, trailerSchemaDefaults } from './Trailer';
import { Sheet } from './Sheet';
import { FPS, TOTAL_FRAMES } from './timeline';

export const Root = () => (
  <>
    <Composition
      id="Trailer16x9"
      component={Trailer}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ ...trailerSchemaDefaults, format: 'wide' as const, captions: false }}
    />
    <Composition
      id="Trailer9x16"
      component={Trailer}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{ ...trailerSchemaDefaults, format: 'tall' as const, captions: true }}
    />
    {/* Review only: npx remotion still Sheet out/sheet.jpg --props='{"src":"drive-chase"}' */}
    <Composition
      id="Sheet"
      component={Sheet}
      durationInFrames={4000}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ src: 'platform-arrival', format: 'wide' as const, every: 40, cells: 12, cols: 4 }}
    />
  </>
);
