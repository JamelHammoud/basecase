import { expect } from 'vitest';
import type { Page } from 'playwright-core';
import { expectPanelReadable } from './appearanceLayout';
import { shown } from './harness';

export async function evaluationReportLayout(page: Page, html: string) {
  const report = await page.context().newPage();

  try {
    await report.setViewportSize({ width: 390, height: 844 });
    await report.setContent(html);
    await report.evaluate(() => document.fonts.ready.then(() => undefined));
    await expectPanelReadable(report.getByRole('table'));

    for (const paragraph of await report.locator('body > p').all()) await expectPanelReadable(paragraph);

    expect(await report.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const trials = report.getByRole('region', { name: 'Case comparison' });

    await trials.focus();
    await report.keyboard.press('ArrowRight');
    await expect.poll(() => trials.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    expect(await report.getByRole('link', { name: 'Recording', exact: true }).first().getAttribute('href')).toMatch(
      /^[a-f0-9]{64}\.tries\.zip$/,
    );
  } finally {
    await report.close();
  }
}

export async function evaluationTimelineLayout(page: Page) {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  const timeline = page.locator(shown('[data-testid="try-timeline"]'));
  const canvas = (await page.locator(shown('[data-canvas-card]')).boundingBox())!;
  const bounds = (await timeline.boundingBox())!;

  expect(bounds.x).toBeGreaterThanOrEqual(canvas.x);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(canvas.x + canvas.width);
  await expectPanelReadable(timeline.getByTestId('timeline-actions'));

  for (const label of await timeline
    .locator('[data-testid="timeline-lane"] span, [data-testid="timeline-playback"] span')
    .all())
    await expectPanelReadable(label);

  await timeline.focus();
  await page.keyboard.press('Home');
  await expect.poll(() => timeline.getAttribute('data-frame')).toBe('0');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => timeline.getAttribute('data-frame')).toBe('1');
  expect(await timeline.getByRole('button', { name: 'Branch Try', exact: true }).count()).toBe(0);
  await page.setViewportSize({ width: 1440, height: 900 });
}
