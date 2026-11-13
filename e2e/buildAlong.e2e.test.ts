import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { servoLayout } from '../src/robot/sceneRobot';
import type { RobotJoint } from '../src/types/robotics';
import { openApp, shown, type App } from './harness';

interface BuildAlongStudio {
  load: (record: { name: string; parts: unknown[]; project: unknown }) => void;
  sceneRecord: () => { project: Record<string, unknown> };
  parts: () => Array<{ id: string; visible: boolean }>;
  shownParts: () => string[];
  buildAlongSteps: () => Array<{ shown: string[]; servos: Array<{ partId: string; joint: string; id: number }> }>;
}

let app: App;

const part = (id: string, y: number, height: number, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position: [0, y + height / 2, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 40, height, depth: 40 },
  color: '#d8d8d8',
  note: '',
  visible: true,
  locked: false,
  ...extra,
});

const servo = (id: string, y: number) =>
  part(id, y, 40, {
    name: 'Feetech STS3215',
    kind: 'component',
    category: 'actuators',
    componentId: 'feetech-sts3215',
    componentVariant: 'c001',
    color: '#222222',
  });

const parts = [
  part('base', 0, 20, { name: 'Base', dimensions: { width: 80, height: 20, depth: 80 } }),
  servo('pan-servo', 20),
  part('upper-arm', 60, 60, { name: 'Upper Arm' }),
  servo('lift-servo', 120),
  part('forearm', 160, 60, { name: 'Forearm' }),
  part('cutout', 180, 10, { name: 'Cable Hole', role: 'cutout' }),
];

const joint = (id: string, name: string, extra: Partial<RobotJoint>): RobotJoint => ({
  id,
  name,
  type: 'revolute',
  parent: [],
  child: [],
  origin: [0, 0, 0],
  axis: [0, 1, 0],
  limb: 'arm',
  ...extra,
});

const joints: RobotJoint[] = [
  joint('mount', 'Mount', { type: 'fixed', parent: ['base'], child: ['pan-servo'] }),
  joint('pan', 'Shoulder pan', { parent: ['base'], child: ['upper-arm'], actuators: ['pan-servo'] }),
  joint('lift', 'Shoulder lift', { parent: ['upper-arm'], child: ['forearm'], actuators: ['lift-servo'] }),
];

const sceneParts = () =>
  app.page.evaluate(() => (window as unknown as { __studio: BuildAlongStudio }).__studio.parts());

const shownParts = () =>
  app.page.evaluate(() => (window as unknown as { __studio: BuildAlongStudio }).__studio.shownParts().sort());

const planSteps = () =>
  app.page.evaluate(() => (window as unknown as { __studio: BuildAlongStudio }).__studio.buildAlongSteps());

const toolbar = () => app.page.locator(shown('[role=toolbar][aria-label="Build Along"]'));

const stepShown = () => toolbar().getAttribute('data-step');

const sorted = (ids: string[]) => [...ids].sort();

beforeAll(async () => {
  app = await openApp();
  await app.page.evaluate(
    ({ parts, joints }) => {
      const s = (window as unknown as { __studio: BuildAlongStudio }).__studio;

      s.load({ name: 'Arm', parts, project: { ...s.sceneRecord().project, joints } });
    },
    { parts, joints },
  );
  await expect.poll(async () => (await shownParts()).length, { timeout: 30000 }).toBe(parts.length);
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Build Along', () => {
  it('steps through the guide on the canvas, names each servo’s bus ID, and leaves the scene as it was', async () => {
    const before = await sceneParts();

    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Build Along');
    await app.page.keyboard.press('Enter');
    await expect.poll(stepShown, { timeout: 180000 }).toBe('1');

    const steps = await planSteps();
    const busIds = servoLayout(joints);
    const expectedId = (partId: string) => busIds.ids[busIds.movable.findIndex((j) => j.actuators?.includes(partId))];

    expect(steps.length).toBeGreaterThan(1);
    expect(steps.flatMap((s) => s.servos.map((v) => v.partId)).sort()).toEqual(['lift-servo', 'pan-servo']);

    for (const [i, step] of steps.entries()) {
      if (i > 0) await app.page.keyboard.press('ArrowRight');

      await expect.poll(stepShown).toBe(String(i + 1));
      await expect.poll(shownParts).toEqual(sorted(step.shown));

      for (const servo of step.servos) {
        expect(servo.id).toBe(expectedId(servo.partId));
        await expect
          .poll(() => app.page.locator('[data-build-label]').allTextContents())
          .toContain(`${servo.joint}, ID ${servo.id}`);
      }
    }

    expect(steps.at(-1)!.shown).not.toContain('cutout');

    await app.page.keyboard.press('ArrowRight');
    expect(await stepShown()).toBe(String(steps.length));

    await app.page.keyboard.press('Escape');
    await expect.poll(() => toolbar().count()).toBe(0);
    expect(await sceneParts()).toEqual(before);
    await expect.poll(shownParts).toEqual(sorted(parts.map((p) => p.id)));
    expect(await app.page.locator('[data-build-label]').count()).toBe(0);
  }, 300000);
});
