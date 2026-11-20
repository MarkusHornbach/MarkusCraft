// Shared Playwright fixture: fails any test whose page logs errors/warnings or throws.
import { test as base, expect } from '@playwright/test';

/**
 * Messages proven to come from software WebGL itself, not from the game.
 * Keep this list minimal; every entry needs a comment.
 */
export const ALLOWED_CONSOLE: RegExp[] = [
  // Only with MC_CONTAINER_GPU_STALL=1: the cloud container's Chromium (SwiftShader over
  // Vulkan) logs this in every test; CI's own browser does not (docs/fix-pad-flaky-report.md).
  ...(process.env.MC_CONTAINER_GPU_STALL === '1'
    ? [/GL Driver Message \(OpenGL, Performance, .*\): GPU stall due to ReadPixels/]
    : []),
];

export const test = base.extend<{ consoleProblems: string[] }>({
  consoleProblems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('console', (msg) => {
        const type = msg.type();
        if (type !== 'error' && type !== 'warning') return;
        const text = msg.text();
        if (ALLOWED_CONSOLE.some((re) => re.test(text))) return;
        problems.push(`[console.${type}] ${text}`);
      });
      page.on('pageerror', (err) => problems.push(`[pageerror] ${err.message}`));
      await use(problems);
      expect(problems, 'the page must not log errors or warnings').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
