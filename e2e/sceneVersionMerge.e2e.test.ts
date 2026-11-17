import { expect, inject, it } from 'vitest';
import { seedVersionProfile } from './sceneVersionProfile';
import { exposeTestHooks, launchChrome, partCount } from './harness';
import { captureVersion, emptyVersionGraph } from '../src/workspace/sceneVersions';
import { versionPart, versionScene } from '../src/workspace/sceneVersions.fixtures';
import type { Page } from 'playwright-core';

async function command(page: Page, label: string) {
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByLabel('Search commands').fill(label);
  await page.keyboard.press('Enter');
}

async function openLinkedDesigns(page: Page) {
  const base = versionScene([versionPart('bracket'), versionPart('camera')]);
  const root = captureVersion(emptyVersionGraph(), base, { label: 'Baseline', at: '2026-11-16' });
  const ours = { ...base, parts: [versionPart('bracket', 20), base.parts[1]] };
  const theirs = { ...base, parts: [base.parts[0]] };
  const versions = [ours, theirs].map((design, index) => ({
    ...design,
    id: `merge-${index}`,
    name: ['Original arm', 'Camera alternative'][index],
    partCount: design.parts.length,
    updatedAt: '2026-11-16',
    history: JSON.stringify(captureVersion(root, design, { label: `Design ${index}`, at: '2026-11-16' })),
  }));

  await exposeTestHooks(page);
  await seedVersionProfile(page, inject('webUrl'), versions);
  await page.goto(inject('webUrl'));
  await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio));
  await command(page, 'Camera alternative');
  await expect.poll(() => bracketX(page)).toBe(0);
  await command(page, 'Original arm');
  await expect.poll(() => bracketX(page)).toBe(20);
}

async function bracketX(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __studio: { pose: (id: string) => { position: number[] } } }).__studio.pose('bracket')
        .position[0],
  );
}

it('merges a selected branch edit through Scene History and preserves each independent design', async () => {
  const browser = await launchChrome();
  const page = await browser.newPage();

  try {
    await openLinkedDesigns(page);
    await command(page, 'Scene History');
    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    await page.getByRole('switch', { name: 'camera', exact: true }).click();
    await page.getByRole('button', { name: 'Merge Parts', exact: true }).click();
    await expect.poll(() => partCount(page)).toBe(1);
    expect(await bracketX(page)).toBe(20);
    await page
      .getByRole('dialog', { name: 'Scene history', exact: true })
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await command(page, 'Camera alternative');
    await expect.poll(() => bracketX(page)).toBe(0);
    expect(await partCount(page)).toBe(1);
  } finally {
    await browser.close();
  }
});

it('opens a saved version as a linked branch from the scene tab menu', async () => {
  const browser = await launchChrome();
  const page = await browser.newPage();

  try {
    await openLinkedDesigns(page);
    await page.getByRole('tab', { name: 'Original arm', exact: true }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Scene History', exact: true }).click();
    await page.getByRole('button', { name: 'Baseline', exact: true }).click();
    await page.getByRole('button', { name: 'Branch', exact: true }).click();
    await page.getByRole('tab', { name: 'Original arm copy', exact: true }).waitFor();
    await expect.poll(() => partCount(page)).toBe(2);
    expect(await bracketX(page)).toBe(0);
  } finally {
    await browser.close();
  }
});
