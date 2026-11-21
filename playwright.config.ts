// Playwright configuration: Chromium with software WebGL against the production build.
import { defineConfig } from '@playwright/test';

/** Spec files whose tests open two or more game pages (Phase 6 part B on). */
const MULTIPLAYER = /\/mp[A-Z]\w*\.spec\.ts$/;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  snapshotPathTemplate: '{testDir}/screenshots/{arg}{ext}',
  expect: {
    // Software WebGL is slow; stable screenshots need more than the default 5 s.
    timeout: 30_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, threshold: 0.2, animations: 'disabled' },
  },
  projects: [
    { name: 'game', testIgnore: MULTIPLAYER },
    {
      // Several software-rendered pages per test: run one test at a time, next to the rest.
      // With more, WebRTC connections between the pages starve on a 4-core machine.
      name: 'multiplayer',
      testMatch: MULTIPLAYER,
      workers: 1,
    },
  ],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 960, height: 540 },
    deviceScaleFactor: 1,
    trace: 'off',
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: [
    {
      command: 'npm run preview',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // The local PeerJS server of the multiplayer tests (Phase 6); no test reaches outside.
      command: 'npm run signal',
      url: 'http://127.0.0.1:9000/',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
