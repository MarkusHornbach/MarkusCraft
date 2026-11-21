// Phase 6 part D, step 13: "Your player" on the settings page — name, preview, looks.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { getState, openMenu } from './game';
import { BUTTON, Pad, focusOn, installFakePads } from './gamepad';
import { TOUCH_DEVICE } from './touch';

test.describe.configure({ timeout: 120_000 });

const PLAYER_KEY = 'markuscraft.player.v1';

async function openSettings(page: Page): Promise<void> {
  await page.locator('.world-settings-button:visible, .world-form-settings-button:visible').click();
  await page.locator('.player-section').waitFor();
}

function stored(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), PLAYER_KEY);
}

test('Phase 6 AC13.1: "Your player" from the world menu; the look survives a reload; one name', async ({
  page,
}) => {
  await openMenu(page);
  await openSettings(page);
  const section = page.locator('.player-section');
  await expect(section.locator('h2')).toHaveText('Your player');
  await expect(section.locator('#player-section-name')).toBeVisible();
  await expect(section.locator('.player-preview')).toBeVisible();
  await expect(section.locator('.look-button')).toHaveCount(9);
  const ember = section.getByRole('button', { name: 'Look: Ember' });
  await ember.click();
  await expect(ember).toHaveClass(/chosen/);
  await expect(section.locator('.look-button.chosen')).toHaveCount(1);
  expect((await getState(page)).player).toMatchObject({ choice: 2, look: 2 });
  // A name typed here shows in "Join a world".
  await section.locator('#player-section-name').fill('Mira');
  await page.locator('.back-button').click();
  await expect(page.locator('#player-name')).toHaveValue('Mira');
  // And the other way round.
  await page.locator('#player-name').fill('Nils');
  await openSettings(page);
  await expect(section.locator('#player-section-name')).toHaveValue('Nils');
  await page.reload();
  await page.locator('.world-menu[data-ready]').waitFor();
  expect((await getState(page)).player).toMatchObject({ name: 'Nils', choice: 2, look: 2 });
  await openSettings(page);
  await expect(section.getByRole('button', { name: 'Look: Ember' })).toHaveClass(/chosen/);
  // "Automatic" names the look it stands for.
  const automatic = section.locator('.look-button[data-look="0"]');
  await expect(automatic).toHaveAttribute('aria-label', /^Look: Automatic \((\w+)\)$/);
});

test('Phase 6 AC13.2: the preview draws and turns while shown, and is gone afterwards', async ({
  page,
}) => {
  await openMenu(page);
  await openSettings(page);
  const canvas = page.locator('.player-preview-canvas');
  await canvas.waitFor();
  const frames = async (): Promise<number> => (await getState(page)).ui.preview?.frames ?? -1;
  const preview = async (): Promise<unknown> => (await getState(page)).ui.preview ?? null;
  const first = await frames();
  await expect.poll(frames).toBeGreaterThan(first);
  const before = await canvas.screenshot();
  await page.waitForTimeout(1000);
  const after = await canvas.screenshot();
  expect(before.equals(after)).toBe(false);
  await page.locator('.back-button').click();
  expect(await preview()).toBeNull();
  await expect(page.locator('.player-preview-canvas')).toHaveCount(0);
  // Each visit makes a preview of its own and gives it back.
  await openSettings(page);
  await canvas.waitFor();
  await page.locator('.back-button').click();
  await expect(page.locator('.player-preview-canvas')).toHaveCount(0);
});

test('Phase 6 AC13.2: without WebGL for the preview the head icon shows, nothing logged', async ({
  page,
}) => {
  await openMenu(page, '?previewgl=0');
  await openSettings(page);
  await expect(page.locator('.player-preview .player-preview-icon')).toBeVisible();
  await page.waitForTimeout(300);
  expect((await getState(page)).ui.preview ?? null).toBeNull();
  // The picker works without the preview.
  await page.getByRole('button', { name: 'Look: Plum' }).click();
  await expect(page.locator('.player-look-name')).toHaveText('Plum');
  await expect(page.locator('.player-preview-icon')).toHaveAttribute('data-look', '8');
});

test('Phase 6 AC13.4: the controller alone chooses a look on the settings page', async ({
  page,
}) => {
  await installFakePads(page);
  await openMenu(page);
  const pad = new Pad(page);
  await pad.connect();
  // B does nothing on the world list; it makes the pad the active source.
  await pad.tap(BUTTON.B);
  // A fresh page has no worlds: the menu shows the "New world" form.
  await focusOn(page, pad, '.world-form-settings-button');
  await pad.tap(BUTTON.A);
  expect((await getState(page)).ui.screen).toBe('settings');
  await focusOn(page, pad, '.look-button[data-look="6"]');
  expect((await getState(page)).ui.focus).toBe('Look: Dune');
  await pad.tap(BUTTON.A);
  expect((await getState(page)).player.choice).toBe(6);
  await focusOn(page, pad, '.look-button[data-look="0"]');
  expect((await getState(page)).ui.focus).toMatch(/^Look: Automatic \(\w+\)$/);
  await pad.tap(BUTTON.B);
  expect((await getState(page)).ui.screen).toBe('worlds');
  expect((await getState(page)).player.choice).toBe(6);
});

test.describe('touch', () => {
  test.use({ ...TOUCH_DEVICE, viewport: { width: 640, height: 360 } });

  test('Phase 6 AC13.5: reachable by scrolling, finger-sized look buttons, a tap chooses', async ({
    page,
  }) => {
    await openMenu(page);
    await page.locator('.world-settings-button:visible, .world-form-settings-button:visible').tap();
    const fern = page.getByRole('button', { name: 'Look: Fern' });
    await fern.scrollIntoViewIfNeeded();
    for (const b of await page.locator('.look-button').all()) {
      const box = await b.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(48);
      expect(box?.height).toBeGreaterThanOrEqual(48);
    }
    await fern.tap();
    await expect(fern).toHaveClass(/chosen/);
    expect((await getState(page)).player.choice).toBe(1);
  });
});

test('Phase 6 AC13.6: nothing is stored until a look is chosen; choosing one stores it', async ({
  page,
}) => {
  await openMenu(page);
  await openSettings(page);
  expect(await stored(page)).toBeNull();
  await page.getByRole('button', { name: 'Look: River' }).click();
  expect(JSON.parse((await stored(page)) ?? '{}')).toMatchObject({ look: 4 });
});

test('Phase 6 AC13.8: reference of "Your player"', async ({ page }) => {
  await openMenu(page, '?name=Mira');
  await openSettings(page);
  await page.getByRole('button', { name: 'Look: Moss' }).click();
  const section = page.locator('.player-section');
  await section.scrollIntoViewIfNeeded();
  const box = await section.boundingBox();
  if (!box) throw new Error('no section');
  // The Automatic button shows the look of a random key: masked like the moving preview.
  await expect(page).toHaveScreenshot('player-section.png', {
    clip: { x: Math.round(box.x), y: Math.round(box.y), width: 345, height: 290 },
    mask: [page.locator('.player-preview'), page.locator('.look-button[data-look="0"] canvas')],
    maxDiffPixelRatio: 0.05,
  });
});
