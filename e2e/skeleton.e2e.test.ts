import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bipedSkeleton } from '../electron/cad-mcp/recipes/templates.mjs';
import { specToPart } from '../src/agent/agentScene';
import { buildSkeleton } from '../src/agent/skeleton';
import { resolveFrames } from '../src/agent/skeletonFrames';
import type { ProjectSettings, ScenePart } from '../src/types/robotics';
import { openApp, shown, type App } from './harness';

interface StudioHook {
  load: (record: { parts: ScenePart[]; project: ProjectSettings }) => void;
  sceneRecord: () => { parts: ScenePart[]; project: ProjectSettings };
  dragSkeleton: (step: { id: string; delta: [number, number, number]; alone?: boolean }) => void;
}

type Studio = { __studio: StudioHook };

let app: App;

function bipedScene(base: ProjectSettings) {
  const project: ProjectSettings = { ...base, skeleton: buildSkeleton(bipedSkeleton()).skeleton };
  const framed = resolveFrames(
    ['left', 'right'].map((side) => ({
      op: 'add' as const,
      part: {
        id: `${side}-shin`,
        shape: 'box' as const,
        size: [30, 30, 80] as [number, number, number],
        position: [0, 0, -45] as [number, number, number],
        frame: `${side}-knee`,
      },
    })),
    project,
  );

  return { parts: framed.ops.flatMap((op) => (op.op === 'add' ? [specToPart(op.part)] : [])), project };
}

const shinAt = () =>
  app.page.evaluate(
    () =>
      (window as unknown as Studio).__studio.sceneRecord().parts.find((p) => p.id === 'left-shin')?.position ?? null,
  );

const knee = () => app.page.locator(shown('[data-skeleton-joint="left-knee"]')).first();

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Edit Skeleton', () => {
  it('drags a knee with its framed parts and margin, and undoes it in one step', async () => {
    const base = await app.page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord().project);

    await app.page.evaluate((scene) => (window as unknown as Studio).__studio.load(scene), bipedScene(base));
    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Edit Skeleton');
    await app.page.keyboard.press('Enter');
    await expect.poll(() => knee().isVisible(), { timeout: 20000 }).toBe(true);

    const before = await shinAt();
    const margin = await knee().getAttribute('data-margin');

    expect(margin).toMatch(/^\d/);

    await app.page.evaluate(() =>
      (window as unknown as Studio).__studio.dragSkeleton({ id: 'left-knee', delta: [0, 0, -20], alone: true }),
    );

    await expect.poll(shinAt).not.toEqual(before);
    await expect.poll(() => knee().getAttribute('data-margin')).not.toBe(margin);

    await app.page.keyboard.press('Meta+z');

    await expect.poll(shinAt).toEqual(before);
    await expect.poll(() => knee().getAttribute('data-margin')).toBe(margin);
  }, 90000);
});
