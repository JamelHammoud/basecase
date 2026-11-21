import { expect } from 'vitest';
import type { Page } from 'playwright-core';
import { shown } from './harness';

interface ReplayTabs {
  __studioTabs: {
    list: () => { activeId: string };
    select: (id: string) => void;
  };
}

const activeTab = (page: Page) => page.evaluate(() => (window as unknown as ReplayTabs).__studioTabs.list().activeId);
const selectTab = (page: Page, id: string) =>
  page.evaluate((tab) => (window as unknown as ReplayTabs).__studioTabs.select(tab), id);

export async function mountOtherBuildTab(page: Page) {
  const original = await activeTab(page);

  await page.keyboard.press('ControlOrMeta+t');
  await expect.poll(() => activeTab(page)).not.toBe(original);

  const other = await activeTab(page);

  await page.locator(shown('[role=tab]'), { hasText: 'Build' }).first().click();
  await selectTab(page, original);

  return { original, other };
}

export async function assertReplayTabDismissal(page: Page, tabs: { original: string; other: string }) {
  const dialog = page.getByRole('dialog', { name: 'Current replay', exact: true });

  await selectTab(page, tabs.other);
  await expect.poll(() => dialog.count()).toBe(0);
  await selectTab(page, tabs.original);
  await expect.poll(() => dialog.count()).toBe(0);
}
