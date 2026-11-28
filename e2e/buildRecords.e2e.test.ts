import type { Page } from 'playwright-core';
import type { GuidePlan } from '../src/guide/guideTypes';
import { expect, it } from 'vitest';
import { openApp } from './harness';
import { kitArmScene } from '../src/kit/entry.fixtures';
import { openKitScene } from './kitScene';
import { retainSelfContactSceneFiles } from './selfContactScene';
import type { BuildRecord } from '../src/kit/buildRecords';
import type { SavedSceneRecord } from '../src/types/robotics';

function frozenBuild(page: Page) {
  return page.evaluate(() =>
    (
      window as unknown as {
        __studio: {
          frozenBuild: () => { record: BuildRecord; dimensions: unknown[]; guide: GuidePlan } | null;
        };
      }
    ).__studio.frozenBuild(),
  );
}

it('resumes two independent frozen builds through Build after reload and source edits', async () => {
  const app = await openApp();

  try {
    const scene: SavedSceneRecord = {
      ...kitArmScene(),
      id: 'frozen-build-source',
      globalGoal: '',
      annotations: [],
      updatedAt: '2026-11-16T00:00:00.000Z',
      partCount: 2,
    };

    await retainSelfContactSceneFiles(app.page, [scene]);
    await openKitScene(app.page, scene);
    await app.page.getByRole('tab', { name: 'Build', exact: true }).click();

    const create = async (name: string) => {
      await app.page.getByRole('button', { name: 'Make Build', exact: true }).click();
      await app.page.getByRole('textbox', { name: 'Build name', exact: true }).fill(name);
      await app.page
        .getByRole('dialog', { name: 'Make Build', exact: true })
        .getByRole('button', { name: 'Make', exact: true })
        .click();
      await expect.poll(() => app.page.getByRole('button', { name, exact: true }).count()).toBe(1);
    };

    await create('Arm one');
    await create('Arm two');
    await app.page.getByRole('button', { name: 'Arm one', exact: true }).click();
    await app.page.getByRole('button', { name: 'Complete Step', exact: true }).click();
    await expect.poll(() => app.page.getByRole('button', { name: 'Mark Incomplete', exact: true }).count()).toBe(1);
    expect(await app.page.locator('[data-frozen-checks]').count()).toBe(1);
    expect(await app.page.locator('#build-guide').count()).toBe(0);
    expect(await app.page.getByRole('button', { name: 'Define Board', exact: true }).count()).toBe(0);

    const original = await frozenBuild(app.page);

    await app.page.getByRole('button', { name: 'Done', exact: true }).click();
    await app.page.getByRole('button', { name: 'Arm two', exact: true }).click();
    await app.page.getByRole('button', { name: 'Next step', exact: true }).click();
    await expect.poll(() => app.page.getByRole('toolbar', { name: 'Build Along' }).getAttribute('data-step')).toBe('2');
    await app.page.getByRole('button', { name: 'Done', exact: true }).click();
    await app.page.reload();
    await app.page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio));
    await app.page.getByRole('tab', { name: 'Build', exact: true }).click();
    await app.page.getByRole('button', { name: 'Arm one', exact: true }).click();
    await expect.poll(() => app.page.getByRole('button', { name: 'Mark Incomplete', exact: true }).count()).toBe(1);
    await app.page.getByRole('button', { name: 'Done', exact: true }).click();
    await app.page.getByRole('button', { name: 'Arm two', exact: true }).click();
    await expect.poll(() => app.page.getByRole('toolbar', { name: 'Build Along' }).getAttribute('data-step')).toBe('2');
    expect(await app.page.getByRole('button', { name: 'Complete Step', exact: true }).count()).toBe(1);
    expect((await frozenBuild(app.page))?.record.completed).toEqual({});
    await app.page.getByRole('button', { name: 'Done', exact: true }).click();

    const changed = kitArmScene();

    changed.parts[1] = { ...changed.parts[1], dimensions: { ...changed.parts[1].dimensions, width: 8 } };
    await app.page.evaluate(() =>
      (window as unknown as { __studio: { select: (ids: string[]) => void } }).__studio.select(['arm']),
    );
    await app.page.getByRole('tab', { name: 'Inspect', exact: true }).click();
    await app.page.getByRole('textbox', { name: 'Width (X)', exact: true }).fill('8');
    await app.page.getByRole('textbox', { name: 'Width (X)', exact: true }).press('Enter');
    await app.page.getByRole('tab', { name: 'Build', exact: true }).click();
    await app.page.getByRole('button', { name: 'Arm one', exact: true }).click();

    await expect.poll(() => app.page.getByRole('button', { name: 'Mark Incomplete', exact: true }).count()).toBe(1);

    const retained = await frozenBuild(app.page);

    expect(retained?.record.name).toBe('Arm one');
    expect(retained?.dimensions).toContainEqual(kitArmScene().parts[1].dimensions);
    expect(retained?.dimensions).not.toContainEqual(changed.parts[1].dimensions);
    expect(retained?.guide).toEqual(original?.guide);
    expect(retained?.record.kit).toBe(original?.record.kit);
    expect(Object.keys(retained?.record.completed ?? {})).toEqual(['0']);
    await app.page.getByRole('button', { name: 'Done', exact: true }).click();

    const working = await app.page.evaluate(() =>
      (
        window as unknown as { __studio: { sceneRecord: () => { parts: Array<{ id: string; dimensions: unknown }> } } }
      ).__studio.sceneRecord(),
    );

    expect(working.parts.find((part) => part.id === changed.parts[1].id)?.dimensions).toEqual(
      changed.parts[1].dimensions,
    );
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
});
