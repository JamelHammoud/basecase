import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toCad } from '../src/agent/agentFrame';
import { specToPart } from '../src/agent/agentScene';
import type { ProjectSettings, ScenePart } from '../src/types/robotics';
import type { ZUpVec } from '../src/types/skeleton';
import { reachTargets, REACH_MM } from '../src/utils/armReach';
import { buildBom } from '../src/utils/bom';
import { openApp, type App } from './harness';

interface StudioHook {
  load: (record: { parts: ScenePart[]; project: ProjectSettings }) => void;
  select: (ids: string[]) => void;
  sceneRecord: () => { parts: ScenePart[]; project: ProjectSettings };
}

type Studio = { __studio: StudioHook };

const TARGETS: Array<[string, ZUpVec]> = [
  ['Desk', [0, -260, 0]],
  ['Shelf', [150, -200, 160]],
  ['Bin', [-130, -170, 60]],
];

const spheres = TARGETS.map(([name, at]) =>
  specToPart({
    id: `target-${name.toLowerCase()}`,
    name,
    shape: 'sphere',
    size: [16, 16, 16],
    position: at,
    role: 'reference',
  }),
);

let app: App;

const record = () => app.page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord());

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Size Arm to Targets', () => {
  it('sizes an arm to three reference spheres, and one undo removes it', async () => {
    const base = (await record()).project;

    await app.page.evaluate((scene) => (window as unknown as Studio).__studio.load(scene), {
      parts: spheres,
      project: base,
    });
    await app.page.evaluate(
      (ids) => (window as unknown as Studio).__studio.select(ids),
      spheres.map((p) => p.id),
    );
    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Size Arm to Targets');
    await app.page.keyboard.press('Enter');

    const payload = app.page.getByRole('dialog').getByLabel('Payload');

    await expect.poll(() => payload.isVisible(), { timeout: 20000 }).toBe(true);
    await payload.fill('200');
    await app.page.getByRole('button', { name: 'Size Arm', exact: true }).click();

    await expect.poll(async () => (await record()).project.skeleton?.joints.length ?? 0, { timeout: 30000 }).toBe(4);

    const { parts, project } = await record();
    const skeleton = project.skeleton!;
    const servos = parts.filter((p) => p.kind === 'component' && p.frame);
    const bom = buildBom({ parts, project, purchases: {}, measures: {} });
    const servoQty = bom.lines
      .filter((l) => l.partIds.some((id) => servos.some((s) => s.id === id)))
      .reduce((n, l) => n + l.qty, 0);

    expect(skeleton.joints.map((j) => servos.filter((s) => s.frame === j.id).length)).toEqual([1, 1, 1, 1]);
    expect(servoQty).toBe(skeleton.joints.length);

    const reached = reachTargets(
      skeleton,
      spheres.map((s) => toCad(s.position)),
    );

    expect(Math.max(...reached.map((r) => r.errorMm))).toBeLessThanOrEqual(REACH_MM);

    await app.page.keyboard.press('Meta+z');

    await expect
      .poll(async () => (await record()).parts.map((p) => p.id).sort())
      .toEqual(spheres.map((p) => p.id).sort());
    expect((await record()).project.skeleton).toEqual(base.skeleton);
  }, 120000);
});
