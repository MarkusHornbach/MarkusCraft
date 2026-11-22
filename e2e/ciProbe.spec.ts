// Throwaway probe of CI 1 scenario S3: one failing test whose picture does not match.
import { expect, test } from './fixtures';

test('CI 1 S3: a red square does not match the blue reference', async ({ page }) => {
  await page.setContent('<div id="probe" style="width:100px;height:100px;background:red"></div>');
  await expect(page.locator('#probe')).toHaveScreenshot('ci-probe.png', { timeout: 5_000 });
});
