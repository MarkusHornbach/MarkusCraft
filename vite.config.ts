// Vite build + Vitest configuration.
import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

// Coverage runs skip wall-clock limits (see src/testing/timing.ts).
const withCoverage = process.argv.some((arg) => arg.startsWith('--coverage'));

/** The commit the build was made from: results of the performance test name it. */
function buildCommit(): string {
  const fromActions = process.env.GITHUB_SHA;
  if (fromActions) return fromActions.slice(0, 7);
  try {
    const head = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] });
    return head.toString().trim().slice(0, 7) || 'dev';
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  base: './',
  define: { __BUILD_COMMIT__: JSON.stringify(buildCommit()) },
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
        'src/render/textures/tiles.ts',
        'src/render/textures/itemIcons.ts',
        'src/render/textures/cracks.ts',
        'src/render/textures/itemIcons.ts',
        'src/render/textures/cracks.ts',
        'src/input/TouchTracker.ts',
        'src/game/autosave.ts',
        'src/game/perfStats.ts',
      ],
      exclude: ['**/*.test.ts'],
      thresholds: { lines: 85 },
      reporter: ['text-summary', 'html'],
    },
  },
});
