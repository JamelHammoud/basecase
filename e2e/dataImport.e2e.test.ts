import { zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { lerobotDataset } from '../src/datasets/import/fixtures';
import { JOINT_STATE_SCHEMA, writeMcap } from '../src/datasets/import/mcapFixtures';
import { encodeJointState } from '../src/datasets/import/ros2Cdr';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { startFakeHub, type FakeHub } from './fakeHub';
import { openApp, partCount, shown, type App } from './harness';

let app: App;
let hub: FakeHub;

const JOINTS = ['arm0', 'arm1', 'arm2'];
const HUB_REPO = 'tester/arm_pick';

type Studio = { load: (r: unknown) => void; pickFiles: (f: Array<{ name: string; base64: string }>) => void };

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

const paletteRow = (label: string) => app.page.locator(shown('button[data-idx]')).filter({ hasText: label });

async function importFromPalette(name: string, bytes: Uint8Array) {
  await app.page.evaluate(
    (picked) => {
      (window as unknown as { __studio: Studio }).__studio.pickFiles(picked);
    },
    [{ name, base64: base64(bytes) }],
  );
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type('Import');
  await paletteRow('Import').filter({ hasNotText: 'Robot' }).click();
}

const armDataset = (lengths: number[], shift: number) =>
  lerobotDataset({
    names: JOINTS.map((j) => `${j}.pos`),
    lengths,
    value: (n, c, k) => 30 * Math.sin((n + shift + k * 7) / 6 + c),
  });

async function armMcap() {
  const messages = Array.from({ length: 101 }, (_, i) => {
    const stamp = 1_700_000_000 + i / 50;

    return {
      topic: '/joint_states',
      schema: JOINT_STATE_SCHEMA,
      logTime: BigInt(Math.round(stamp * 1e9)),
      data: encodeJointState({ stamp, name: JOINTS, position: JOINTS.map((_, j) => 0.5 * Math.sin(i / 20 + j)) }),
    };
  });

  return writeMcap(messages);
}

const tiles = () => app.page.locator(shown('[data-testid="try-tile"]'));

const toast = (text: string) => app.page.getByText(text, { exact: true }).count();

beforeAll(async () => {
  hub = await startFakeHub({ token: 'hf_fake', port: inject('hubPort') });
  hub.seed(HUB_REPO, armDataset([20], 40));
  app = await openApp({}, ['hub-']);
}, 120000);

afterAll(async () => {
  await app?.close();
  await hub?.close();
});

const itUnlessWindows = it.skipIf(process.platform === 'win32');

describe('Importing robot data as tries', () => {
  itUnlessWindows('imports a LeRobot zip, an MCAP file and a Hub link, and opens one on the timeline', async () => {
    const robot = fixtureRobots().find((r) => r.id === 'arm-3dof')!;

    await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
      name: robot.id,
      parts: robot.parts,
      project: { ...DEFAULT_PROJECT, joints: robot.joints },
    });
    await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);

    await importFromPalette('arm_pick.zip', zipSync(armDataset([24, 18], 0)));
    await expect.poll(() => toast('Imported 2 tries'), { timeout: 60000 }).toBeGreaterThan(0);
    await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
    await app.page.locator(shown('[data-testid="library-tries"] button')).first().click();
    await expect.poll(() => tiles().count()).toBe(2);
    await importFromPalette('arm.mcap', await armMcap());
    await expect.poll(() => tiles().count(), { timeout: 60000 }).toBe(3);

    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Import Robot');
    await app.page.keyboard.press('Enter');
    await app.page.getByLabel('Robot link').fill(`https://huggingface.co/datasets/${HUB_REPO}`);
    await app.page.keyboard.press('Enter');
    await expect.poll(() => tiles().count(), { timeout: 60000 }).toBe(4);

    const from = (origin: string) => tiles().filter({ hasText: origin }).count();

    expect([await from('arm_pick.zip'), await from('arm.mcap'), await from(HUB_REPO)]).toEqual([2, 1, 1]);
    expect(hub.requests.some((r) => r.path.endsWith('.mp4'))).toBe(false);

    await importFromPalette('arm_pick.zip', zipSync(armDataset([24, 18], 0)));
    await expect.poll(() => toast('Imported 0 tries'), { timeout: 60000 }).toBeGreaterThan(0);
    expect(await tiles().count()).toBe(4);

    await tiles().filter({ hasText: HUB_REPO }).click();
    await expect.poll(() => app.page.getByTestId('timeline-lane').count(), { timeout: 30000 }).toBe(JOINTS.length);
    await app.page.keyboard.press('Escape');
    expect(app.errors).toEqual([]);
  });
});
