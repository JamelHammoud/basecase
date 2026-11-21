import { expect } from 'vitest';
import type { Page } from 'playwright-core';
import { expectPanelReadable } from './appearanceLayout';

export async function expectTeachingLayout(page: Page, owner?: 'policy' | 'operator') {
  const section = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Try', exact: true }) })
    .filter({ visible: true });

  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expectPanelReadable(section);

  if (!owner) {
    const manual = (await section.getByRole('button', { name: 'Try It', exact: true }).boundingBox())!;
    const policy = (await section.getByRole('button', { name: 'Try Policy', exact: true }).boundingBox())!;

    expect(manual.y + manual.height).toBeLessThanOrEqual(policy.y);

    return;
  }

  expect(await section.getByRole('button', { name: 'Try Policy', exact: true }).count()).toBe(0);
  expect(await section.getByRole('button', { name: 'Try It', exact: true }).count()).toBe(0);

  const stop = (await section.getByRole('button', { name: 'Stop Try', exact: true }).boundingBox())!;
  const handoff = (await section
    .getByRole('button', { name: owner === 'operator' ? 'Resume Policy' : 'Take Control', exact: true })
    .boundingBox())!;

  expect(stop.y + stop.height).toBeLessThanOrEqual(handoff.y);
}
