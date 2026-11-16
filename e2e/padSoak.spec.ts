// Controller soak (Phase 5 AC4.1): 2 000 seeded frames of random sticks, buttons,
// connects and disconnects, in play and in the menus, without a console message.
import { expect, test } from './fixtures';
import { createWorld, getState, openMenu } from './game';
import { installFakePads } from './gamepad';

test.describe.configure({ timeout: 600_000 });

const FRAMES = 2000;
const SEED = 5;

test('Phase 5 AC4.1: 2 000 random controller frames in play and in the menus', async ({ page }) => {
  await installFakePads(page);
  await openMenu(page);
  await createWorld(page);
  const report = await page.evaluate(
    async ([frames, seed]) => {
      // A small seeded generator (mulberry32): the same run every time.
      let state = seed >>> 0;
      const random = (): number => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const op = window.__fakePadOp;
      if (!op) throw new Error('no fake pads');
      const nextFrame = (): Promise<void> =>
        new Promise((done) => requestAnimationFrame(() => done()));
      let connected = false;
      const screens = new Set<string>();
      let connects = 0;
      let presses = 0;
      for (let i = 0; i < frames; i++) {
        const roll = random();
        if (!connected) {
          if (roll < 0.3) {
            op({ kind: 'connect', index: 0, mapping: 'standard', id: 'Soak', holding: [] });
            connected = true;
            connects++;
          }
        } else if (roll < 0.004) {
          op({ kind: 'disconnect', index: 0 });
          connected = false;
        } else if (roll < 0.5) {
          // Mostly the buttons of play and of the menus; Start and B less often.
          const weights = [0, 0, 0, 1, 1, 2, 3, 4, 5, 6, 7, 7, 10, 12, 13, 14, 15, 1, 9];
          const button = weights[Math.floor(random() * weights.length)];
          op({ kind: 'button', index: 0, button, value: random() < 0.5 ? 1 : random() * 0.6 });
          presses++;
        } else if (roll < 0.8) {
          const which = random() < 0.5 ? 0 : 2;
          const x = random() < 0.3 ? 0 : random() * 2 - 1;
          const y = random() < 0.3 ? 0 : random() * 2 - 1;
          op({ kind: 'stick', index: 0, offset: which, x, y });
        }
        await nextFrame();
        if (i % 10 === 0) {
          const s = window.__mc.getState();
          screens.add(s.ui.screen);
          // A performance test run would only make the soak slow; it is left at once.
          if (s.bench && connected) {
            op({ kind: 'button', index: 0, button: 1, value: 1 });
            await nextFrame();
            await nextFrame();
            op({ kind: 'button', index: 0, button: 1, value: 0 });
          }
        }
      }
      if (connected) op({ kind: 'disconnect', index: 0 });
      await nextFrame();
      await nextFrame();
      return { screens: [...screens].sort(), connects, presses };
    },
    [FRAMES, SEED],
  );
  // The run went through play and through menus, and connected more than once.
  expect(report.screens).toContain('play');
  expect(report.screens.some((screen) => screen !== 'play')).toBe(true);
  expect(report.connects).toBeGreaterThan(1);
  expect(report.presses).toBeGreaterThan(500);
  const state = await getState(page);
  expect(state.pad).toMatchObject({ connected: 0, active: false });
  // Whatever world is open: its light is still right.
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});
