import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { presetCase } from '../src/cases/caseBuilder';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { openApp, openPlayTab, partCount, type App } from './harness';

let app: App;

interface SimState {
  drive: string;
  stats: { time: number } | null;
  activeCase: string | null;
  faults: Record<string, string>;
  tries: Array<{ passed: boolean; faults: Array<{ joint: string; kind: string; at: number }> }>;
}

type Studio = { simState: () => SimState; load: (r: unknown) => void };

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const simState = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState() as SimState);

const button = (name: string | RegExp) => app.page.locator(visible('button'), { hasText: name }).first();

async function holdKey(key: string, ms: number) {
  await app.page.mouse.click(720, 450);
  await app.page.keyboard.down(key);
  await app.page.waitForTimeout(ms);
  await app.page.keyboard.up(key);
}

async function openTouchTheDots() {
  const robot = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
  const kase = presetCase('touch-the-dots', buildRig(robot.joints, robot.parts), robot.parts);

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: 'arm-3dof',
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints, cases: [kase] },
  });
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
  await openPlayTab(app.page, 'Cases');
  await app.page.locator(visible('[data-testid="cases-panel"] button'), { hasText: kase.name }).first().click();
  await expect.poll(async () => (await simState()).activeCase).toBe(kase.id);
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

const itUnlessWindows = it.skipIf(process.platform === 'win32');

describe('servo faults', () => {
  itUnlessWindows('makes a joint Limp from Peak torque during a try, and the try records it', async () => {
    await openTouchTheDots();
    await button('Try It').click();
    await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
    await holdKey('w', 800);

    const row = app.page.locator(visible('[data-testid="peak-row"]')).first();
    const item = (name: string) => app.page.locator(visible('[role=menuitem]'), { hasText: new RegExp(`^${name}$`) });

    await expect.poll(() => row.count(), { timeout: 30000 }).toBe(1);
    await row.click({ button: 'right' });
    await item('Fault').click();
    await item('Limp').click();
    await expect.poll(async () => Object.values((await simState()).faults)).toEqual(['limp']);
    await expect.poll(() => row.innerText()).toContain('Limp');

    const [joint] = Object.keys((await simState()).faults);
    const limpAt = (await simState()).stats!.time;

    await button('Stop Try').click();
    await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);

    const [fault] = (await simState()).tries[0].faults;

    expect(fault).toMatchObject({ joint, kind: 'limp' });
    expect(fault.at).toBeGreaterThan(0);
    expect(fault.at).toBeLessThanOrEqual(limpAt);
    await expect.poll(() => app.page.getByTestId('try-fault').innerText()).toBe('Limp');
    expect(app.errors).toEqual([]);
  });
});
