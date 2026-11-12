// Dev tool: screenshot the running preview server. Usage: node scripts/shot.mjs <urlPath> <out.png> [jsToEval]
import { chromium } from '@playwright/test';
const [, , path, out, js] = process.argv;
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
page.on('console', (m) => console.log('[console.' + m.type() + ']', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:4173/' + path);
await page.waitForFunction(() => window.__mc && window.__mc.isReady(), null, { timeout: 60000 });
if (js) console.log(JSON.stringify(await page.evaluate(js)));
await page.screenshot({ path: out });
await browser.close();
