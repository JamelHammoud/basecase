import type { Locator, Page } from 'playwright-core';
import { expect } from 'vitest';

export { JOYSTICK, HUD, COCKPIT } from './codePanelSources';

export async function pushStick(page: Page, pad: Locator) {
  let centre = { x: 0, y: 0 };
  let nudge = 0;

  await expect
    .poll(async () => {
      const box = (await pad.boundingBox())!;

      centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await page.mouse.move(centre.x + (nudge++ % 2), centre.y);

      return pad.evaluate((el) => el.matches(':hover'));
    })
    .toBe(true);
  await page.mouse.down();
  await page.mouse.move(centre.x, centre.y - 70, { steps: 4 });
}
