// Vite build + Vitest configuration.
import { defineConfig } from 'vitest/config';

// Coverage runs skip wall-clock limits (see src/testing/timing.ts).
const withCoverage = process.argv.some((arg) => arg.startsWith('--coverage'));

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  preview: { port: 4173, strictPort: true },
  test: {
    environment: 'node',
    env: { MC_COVERAGE: withCoverage ? '1' : '0' },
    // The terrain property tests generate hundreds of chunks; allow for slow CI machines.
    testTimeout: 60_000,
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
        'src/render/textures/tiles.ts',
        'src/render/textures/itemIcons.ts',
        'src/render/textures/cracks.ts',
        'src/render/textures/itemIcons.ts',
        'src/render/textures/cracks.ts',
        'src/input/TouchTracker.ts',
        'src/game/autosave.ts',
      ],
      exclude: ['**/*.test.ts'],
      thresholds: { lines: 85 },
      reporter: ['text-summary', 'html'],
    },
  },
});
