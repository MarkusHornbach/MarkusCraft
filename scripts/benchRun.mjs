// Dev tool: plays the performance test in headless Chromium and prints what happened.
// It proves that a suite runs to its end; numbers from software WebGL mean nothing.
// Usage: npm run build && npm run preview, then
//   node scripts/benchRun.mjs [1|quick] [folder for screenshots]
import { chromium } from '@playwright/test';

const suite = process.argv[2] ?? 'quick';
const folder = process.argv[3];
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('console', (message) => console.log(`[console.${message.type()}] ${message.text()}`));
page.on('pageerror', (error) => console.log(`[pageerror] ${error.message}`));
const shot = async (name) => {
  if (folder) await page.screenshot({ path: `${folder}/${name}.png` });
};

await page.goto(`http://localhost:4173/?bench=${suite}`);
await page.waitForFunction(() => window.__mc?.getState().bench?.phase === 'start');
await shot('start');
const started = Date.now();
await page.locator('.bench-start-button').click();
let shown = '';
for (;;) {
  const bench = await page.evaluate(() => window.__mc.getState().bench);
  const line = `${bench.phase} ${bench.index}/${bench.total} ${bench.scenario ?? ''}`;
  if (line !== shown) {
    console.log(`${((Date.now() - started) / 1000).toFixed(1)} s  ${line}`);
    shown = line;
    if (bench.phase === 'running' && bench.index > 0) await shot(`run-${bench.index}`);
  }
  if (bench.phase !== 'running') break;
  await page.waitForTimeout(250);
}
console.log(`finished after ${((Date.now() - started) / 1000).toFixed(1)} s`);
await shot('result');
const result = await page.evaluate(() => window.__mc.benchResult());
if (result) {
  const href = await page.locator('.bench-issue-link').getAttribute('href');
  console.log(`issue link: ${href.length} characters`);
  console.log(await page.locator('.bench-text').inputValue());
}
await browser.close();
