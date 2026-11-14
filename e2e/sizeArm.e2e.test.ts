import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { specToPart } from '../src/agent/agentScene';
import type { ProjectSettings, ScenePart } from '../src/types/robotics';
import type { RobotSkeleton, ZUpVec } from '../src/types/skeleton';
import { armTip, REACH_MM } from '../src/utils/armSizing';
import { reachWithTip, skeletonRig } from '../src/utils/skeletonRig';
import { openApp, shown, type App } from './harness';

interface StudioHook {
  load: (record: { parts: ScenePart[]; project: ProjectSettings }) => void;
  sceneRecord: () => { parts: ScenePart[]; project: ProjectSettings };
  select: (ids: string[]) => void;
  bomLines: () => Array<{ key: string; qty: number }>;
}

type Studio = { __studio: StudioHook };

const SPHERES: Array<{ id: string; at: ZUpVec }> = [
  { id: 'desk', at: [0, -250, 20] },
  { id: 'shelf', at: [120, -200, 300] },
  { id: 'bin', at: [-220, -150, 0] },
];

const SEEDS = [-60, 0, 60].flatMap((shoulder) =>
  [-80, 0, 80].map((elbow) => ({ shoulder_pitch: shoulder, elbow_pitch: elbow })),
);

let app: App;

const record = () => app.page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord());

function bestReach(skeleton: RobotSkeleton, at: ZUpVec): number {
  const rig = skeletonRig(skeleton);
  const tip = armTip(skeleton);

  return Math.min(...SEEDS.map((seed) => reachWithTip(rig, tip, at, seed).errorMm));
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Size Arm to Targets', () => {
  it('sizes an arm to three reference spheres from Enter in Payload and undoes it in one step', async () => {
    const base = (await record()).project;
    const parts = SPHERES.map(({ id, at }) =>
      specToPart({ id, name: id, shape: 'sphere', size: [20, 20, 20], position: at, role: 'reference' }),
    );

    await app.page.evaluate((scene) => (window as unknown as Studio).__studio.load(scene), { parts, project: base });
    await app.page.evaluate(
      (ids) => (window as unknown as Studio).__studio.select(ids),
      SPHERES.map((s) => s.id),
    );
    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Size Arm to Targets');
    await app.page.keyboard.press('Enter');

    const sheet = app.page.locator(shown('[role="dialog"][aria-label="Size Arm to Targets"]'));

    await expect.poll(() => sheet.locator('[data-arm-target]').count()).toBe(3);
    await sheet.getByLabel('Payload').fill('250');
    await sheet.getByLabel('Payload').press('Enter');
    await expect.poll(async () => (await record()).project.skeleton?.joints.length ?? 0).toBe(4);

    const { project } = await record();
    const skeleton = project.skeleton!;
    const lines = await app.page.evaluate(() => (window as unknown as Studio).__studio.bomLines());
    const servos = lines.filter((l) => /sts3215|sts3250|st3215/.test(l.key));

    expect(servos.reduce((n, l) => n + l.qty, 0)).toBe(skeleton.joints.length);
    expect(skeleton.joints.at(-1)?.payloadG).toBe(250);

    for (const s of SPHERES) expect(bestReach(skeleton, s.at), s.id).toBeLessThanOrEqual(REACH_MM);

    await app.page.keyboard.press('Meta+z');

    await expect.poll(async () => (await record()).project.skeleton).toBeUndefined();
    await expect.poll(async () => (await record()).parts.map((p) => p.id).sort()).toEqual(['bin', 'desk', 'shelf']);
  }, 90000);
});
