// Vite build + Vitest configuration.
import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';
import { buildCommit } from './src/game/buildCommit.ts';

// Coverage runs skip wall-clock limits (see src/testing/timing.ts).
const withCoverage = process.argv.some((arg) => arg.startsWith('--coverage'));

/** The checkout's HEAD commit, or null without git. */
function gitHead(): string | null {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch {
    return null;
  }
}

export default defineConfig({
  base: './',
  define: { __BUILD_COMMIT__: JSON.stringify(buildCommit(process.env, gitHead)) },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  preview: { port: 4173, strictPort: true },
  test: {
    environment: 'node',
    env: { MC_COVERAGE: withCoverage ? '1' : '0' },
    // The terrain property tests generate hundreds of chunks; allow for slow CI machines.
    // Coverage makes the slow tests several times slower still.
    testTimeout: withCoverage ? 240_000 : 60_000,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/world/**',
        'src/player/**',
        'src/util/**',
        'src/actions/**',
        'src/items/**',
        'src/save/**',
        'src/bench/**',
        'src/net/**',
        'src/render/textures/tiles.ts',
        'src/render/textures/itemIcons.ts',
        'src/render/textures/cracks.ts',
        'src/render/textures/figureTexture.ts',
        'src/input/TouchTracker.ts',
        'src/input/padMapping.ts',
        'src/input/focusMove.ts',
        'src/game/autosave.ts',
        'src/game/perfStats.ts',
        'src/game/netConfig.ts',
        'src/game/buildCommit.ts',
      ],
      exclude: ['**/*.test.ts'],
      thresholds: { lines: 85 },
      reporter: ['text-summary', 'html'],
    },
  },
});
