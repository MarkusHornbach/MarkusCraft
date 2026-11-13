// Vite build + Vitest configuration.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  preview: { port: 4173, strictPort: true },
  test: {
    environment: 'node',
    // The terrain property tests generate hundreds of chunks; allow for slow CI machines.
    testTimeout: 60_000,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/world/**', 'src/player/**', 'src/util/**', 'src/render/textures/tiles.ts'],
      exclude: ['**/*.test.ts'],
      thresholds: { lines: 85 },
      reporter: ['text-summary', 'html'],
    },
  },
});
