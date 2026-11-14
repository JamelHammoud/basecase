import type { Locator, Page } from 'playwright-core';
import { expect } from 'vitest';
import { FALL_BIPED_POSE, fallBiped } from '../src/sim/fixtures/fallBiped';
import type { FixtureRobot } from '../src/sim/fixtures/parts';
import { sceneRecord, studioLoad, type StudioHook } from './buildCheckFixtures';
import { partCount } from './harness';

export const agentRequest = (page: Page, kind: string, payload: object) =>
  page.evaluate(({ k, p }) => (window as unknown as { __studio: StudioHook }).__studio.agentRequest(k, p), {
    k: kind,
    p: payload,
  });

export const selection = (page: Page) =>
  page.evaluate(() => (window as unknown as { __studio: StudioHook }).__studio.selection().sort());

export async function loadFallBiped(page: Page, bodyG?: number) {
  const biped = fallBiped('c001', bodyG);

  await studioLoad(page, {
    parts: biped.parts,
    project: { ...(await sceneRecord(page)).project, joints: biped.joints, pose: FALL_BIPED_POSE },
  });
  await expect.poll(() => partCount(page)).toBe(biped.parts.length);

  return biped;
}

export async function openedItem(row: Locator, check: string, item: Locator) {
  const button = row.getByRole('button', { name: new RegExp(`^${check}`) }).first();

  if ((await row.isVisible()) && (await button.getAttribute('aria-expanded')) !== 'true') await button.click();

  return item.isVisible();
}

export function kneeLink(biped: FixtureRobot, itemText: string) {
  const side = /(Left|Right) knee/.exec(itemText)?.[0];

  return [...(biped.joints.find((j) => j.name === side)?.child ?? [])].sort();
}
