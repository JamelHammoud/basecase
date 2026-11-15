import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { presetCase } from '../src/cases/caseBuilder';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { openApp, partCount, shown, type App } from './harness';

let app: App;

interface Studio {
  load: (record: unknown) => void;
  runCase: (id: string) => void;
  referenceTry: () => Promise<void>;
  simState: () => { drive: string; status: string; playing: boolean; tries: unknown[] };
}

type StudioWindow = { __studio: Studio };

const robot = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
const kase = presetCase('touch-the-dots', buildRig(robot.joints, robot.parts), robot.parts);
const state = () => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.simState());
const button = (name: string) => app.page.locator(shown('button'), { hasText: name }).first();

beforeEach(async () => {
  app = await openApp();
  await app.page.evaluate((record) => (window as unknown as StudioWindow).__studio.load(record), {
    name: 'Case startup',
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints, cases: [kase] },
  });
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
  await app.page.evaluate((id) => (window as unknown as StudioWindow).__studio.runCase(id), kase.id);
});

afterEach(async () => {
  await app?.close();
});

describe('Case startup ownership', () => {
  it('finishes a reference startup through workspace renders and records its try', async () => {
    await app.page.evaluate(() => (window as unknown as StudioWindow).__studio.referenceTry());
    expect((await state()).drive).toBe('on');
    expect((await state()).playing).toBe(true);
    await expect.poll(() => button('Stop Try').count()).toBe(1);
    await expect
      .poll(async () =>
        Number.parseFloat((await app.page.locator(shown('[data-testid="try-clock"]')).first().textContent()) ?? '0'),
      )
      .toBeGreaterThan(0.1);
    await button('Stop Try').click();
    await expect.poll(async () => (await state()).tries.length).toBe(1);
    await expect.poll(async () => (await state()).drive).toBe('off');
    expect(app.errors).toEqual([]);
  });
});
