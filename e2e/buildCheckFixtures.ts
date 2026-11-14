import { expect } from 'vitest';
import type { Page } from 'playwright-core';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT, type ProjectSettings, type ScenePart } from '../src/types/robotics';
import type { WalkSim } from '../src/utils/engineeringTypes';
import { walkKey } from '../src/workspace/storedWalk';

export interface StudioHook {
  load: (record: { parts: unknown[]; project: unknown }) => void;
  sceneRecord: () => { parts: ScenePart[]; project: ProjectSettings };
  simState: () => { activeCase: string | null };
}

export const standIn = (id: string, x: number) => ({
  id,
  name: `Generic servo ${id}`,
  kind: 'servo',
  category: 'actuators',
  role: 'solid',
  position: [x, 20, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 40, height: 40, depth: 20 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
});

export const servo = {
  ...standIn('servo', 0),
  name: 'Feetech STS3215',
  kind: 'component',
  componentId: 'feetech-sts3215',
  componentVariant: 'c001',
};

export const armWithEstimates = () => {
  const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
  const servo = { ...standIn('mg996r', 0), name: 'MG996R', kind: 'component', componentId: 'towerpro-mg996r' };
  const joints = arm.joints.map((j) => {
    if (j.id === 'arm0') return { ...j, effortNm: undefined };

    return j.id === 'arm1' ? { ...j, actuators: ['mg996r'] } : j;
  });

  return { name: 'arm', parts: [...arm.parts, servo], project: { ...DEFAULT_PROJECT, joints } };
};

const studioLoad = (page: Page, record: { parts: unknown[]; project: unknown }) =>
  page.evaluate((r) => (window as unknown as { __studio: StudioHook }).__studio.load(r), record);

const sceneRecord = (page: Page) =>
  page.evaluate(() => (window as unknown as { __studio: StudioHook }).__studio.sceneRecord());

export async function loadKnees(page: Page) {
  const knee = (id: string, x: number) => ({ ...servo, id, name: `Servo ${id}`, position: [x, 20, 0] });
  const pack = { ...standIn('pack', 0), name: 'Pack', kind: 'component', componentId: 'ovonic-2s-2200-50c' };
  const rail = { ...standIn('rail', 120), name: 'Rail', kind: 'component', componentId: 'pololu-d36v50f6' };
  const joints = [
    { id: 'ja', name: 'Left knee', limb: 'leg', parent: ['pack'], child: ['a'], actuators: ['a'] },
    { id: 'jb', name: 'Right knee', limb: 'leg', parent: ['pack'], child: ['b'], actuators: ['b'] },
  ].map((j) => ({ ...j, type: 'revolute', origin: [0, 20, 0], axis: [1, 0, 0] }));

  await studioLoad(page, {
    parts: [knee('a', -60), knee('b', 60), pack, rail],
    project: { ...(await sceneRecord(page)).project, joints },
  });
}

const shown = (selector: string) => `${selector}:not([inert] *):visible`;

export async function bomRow(
  page: Page,
  scene: { parts: unknown[]; project: Pick<ProjectSettings, 'joints'> },
  name: string,
) {
  await studioLoad(page, {
    parts: scene.parts,
    project: { ...(await sceneRecord(page)).project, joints: scene.project.joints },
  });
  await page.locator(shown('[role=tab]'), { hasText: 'Build' }).first().click();

  const bom = page.locator(shown('section'), { hasText: /^Bill of materials/ }).first();
  const supplies = bom.getByRole('button', { name: /^Supplies/ }).first();

  await expect.poll(() => supplies.isVisible(), { timeout: 45000 }).toBe(true);

  if ((await supplies.getAttribute('aria-expanded')) === 'false') await supplies.click();

  return bom.locator('li ul > li').filter({ hasText: name });
}

export async function storeWalk(page: Page, walk: WalkSim) {
  const scene = await sceneRecord(page);

  await studioLoad(page, {
    parts: scene.parts,
    project: { ...scene.project, walk: { ...walk, key: walkKey(scene.parts, scene.project) } },
  });
}
