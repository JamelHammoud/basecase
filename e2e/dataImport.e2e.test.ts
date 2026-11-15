import { zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { flatRecording } from '../src/datasets/import/flatRecordingFixtures';
import { lerobotDataset } from '../src/datasets/import/fixtures';
import { JOINT_STATE_SCHEMA, writeMcap } from '../src/datasets/import/mcapFixtures';
import { encodeJointState } from '../src/datasets/import/ros2Cdr';
import { imuAt, ROS2_LEVEL, rosoutAt } from '../src/datasets/import/topicFixtures';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import type { VisionManifest } from '../src/vision/manifest';
import { inputSensitiveDetectionOnnx } from '../src/vision/onnxFixture';
import { startFakeHub, type FakeHub } from './fakeHub';
import { openApp, partCount, shown, type App } from './harness';
import { visionManifest } from './visionFixtures';

let app: App;
let hub: FakeHub;

const JOINTS = ['arm0', 'arm1', 'arm2'];
const MOTORS = ['motor_1', 'motor_2', 'motor_3'];
const HUB_REPO = 'tester/arm_pick';

type PanelReport = { id: string; kind: string; samples?: number[]; entries?: Array<{ level: string; text: string }> };

type Studio = {
  load: (r: unknown) => void;
  configureVision: (manifest: VisionManifest, bytes: number[], cameras: string[]) => Promise<unknown>;
  pickFiles: (f: Array<{ name: string; base64: string }>) => void;
  recordingPanels: () => PanelReport[] | null;
};

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

const paletteRow = (label: string) => app.page.locator(shown('button[data-idx]')).filter({ hasText: label });

async function importFromPalette(name: string, bytes: Uint8Array) {
  await app.page.evaluate(
    (picked) => {
      (window as unknown as { __studio: Studio }).__studio.pickFiles(picked);
    },
    [{ name, base64: base64(bytes) }],
  );
  await app.page.keyboard.press('ControlOrMeta+k');
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
      data: encodeJointState({ stamp, name: MOTORS, position: MOTORS.map((_, j) => 0.5 * Math.sin(i / 20 + j)) }),
    };
  });

  return writeMcap(messages);
}

const IMU_SAMPLES = 151;

async function robotMcap() {
  const start = 1_700_000_000;
  const joints = Array.from({ length: 151 }, (_, i) => {
    const stamp = start + i / 50;

    return {
      topic: '/joint_states',
      schema: JOINT_STATE_SCHEMA,
      logTime: BigInt(Math.round(stamp * 1e9)),
      data: encodeJointState({ stamp, name: JOINTS, position: JOINTS.map((_, j) => 0.3 * Math.sin(i / 25 + j)) }),
    };
  });
  const imu = Array.from({ length: IMU_SAMPLES }, (_, i) => imuAt(start, i / 50));
  const logs = [
    rosoutAt(start + 0.5, ROS2_LEVEL.info, 'Arm homed'),
    rosoutAt(start + 2, ROS2_LEVEL.warn, 'Wrist torque near limit'),
  ];

  return writeMcap([...joints, ...imu, ...logs], { chunked: true, compression: 'zstd' });
}

const tiles = () => app.page.locator(shown('[data-testid="try-tile"]'));

const recordingPanels = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.recordingPanels());

const toast = (text: string) => app.page.getByText(text, { exact: true }).count();

const matchSheet = () => app.page.locator(shown('[data-testid="match-joints"]'));

async function matchMotors() {
  await expect.poll(() => matchSheet().count(), { timeout: 60000 }).toBe(1);

  for (const [i, motor] of MOTORS.entries()) await matchSheet().getByLabel(motor).selectOption(JOINTS[i]);

  await app.page.getByRole('dialog').getByRole('button', { name: 'Import', exact: true }).click();
}

beforeAll(async () => {
  hub = await startFakeHub({ token: 'hf_fake', port: inject('hubPort') });
  hub.seed(HUB_REPO, armDataset([20], 40));
}, 120000);

beforeEach(async () => {
  app = await openApp({}, ['hub-']);

  const bytes = inputSensitiveDetectionOnnx();

  await app.page.evaluate(
    ({ manifest, data }) => (window as unknown as { __studio: Studio }).__studio.configureVision(manifest, data, []),
    { manifest: visionManifest(bytes), data: [...bytes] },
  );
});

afterEach(async () => {
  await app?.close();
});

afterAll(async () => {
  await hub?.close();
});

async function loadArm() {
  const robot = fixtureRobots().find((r) => r.id === 'arm-3dof')!;

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: robot.id,
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
}

async function showTries() {
  if (!(await app.page.locator(shown('[data-testid="library-tries"]')).count()))
    await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();

  await app.page.locator(shown('[data-testid="library-tries"] button')).first().click();
}

const itUnlessWindows = it.skipIf(process.platform === 'win32');

describe('Importing robot data as tries', () => {
  itUnlessWindows(
    'imports a LeRobot zip, an MCAP file through Match Joints and a Hub link, and opens one on the timeline',
    async () => {
      await loadArm();
      await importFromPalette('arm_pick.zip', zipSync(armDataset([24, 18], 0)));
      await expect.poll(() => toast('Imported 2 tries'), { timeout: 60000 }).toBeGreaterThan(0);
      await showTries();
      await expect.poll(() => tiles().count()).toBe(2);

      const mcap = await armMcap();

      await importFromPalette('arm.mcap', mcap);
      await matchMotors();
      await expect.poll(() => tiles().count(), { timeout: 60000 }).toBe(3);
      await importFromPalette('arm.mcap', mcap);
      await expect.poll(() => toast('Imported 0 tries'), { timeout: 60000 }).toBeGreaterThan(0);
      expect(await matchSheet().count()).toBe(0);
      expect(await tiles().count()).toBe(3);

      await app.page.keyboard.press('ControlOrMeta+k');
      await app.page.keyboard.type('Import Robot');
      await app.page.keyboard.press('Enter');
      await app.page.getByLabel('Robot link').fill(`https://huggingface.co/datasets/${HUB_REPO}`);
      await app.page.keyboard.press('Enter');
      await expect.poll(() => tiles().count(), { timeout: 60000 }).toBe(4);

      const from = (origin: string) => tiles().filter({ hasText: origin }).count();

      expect([await from('arm_pick.zip'), await from('arm.mcap'), await from(HUB_REPO)]).toEqual([2, 1, 1]);
      expect(hub.requests.some((r) => r.path.endsWith('.mp4'))).toBe(false);

      await tiles().filter({ hasText: HUB_REPO }).click();
      await expect.poll(() => app.page.getByTestId('timeline-lane').count(), { timeout: 30000 }).toBe(JOINTS.length);
      await app.page.keyboard.press('Escape');
      expect(app.requests.filter((url) => url.includes('/api/bridge/hub-model-file'))).toEqual([]);
      expect(app.errors).toEqual([]);
    },
  );

  itUnlessWindows('opens an MCAP with every topic and shows its log and IMU plot in the console', async () => {
    await loadArm();
    await importFromPalette('robot.mcap', await robotMcap());
    await expect.poll(() => toast('Imported 1 try'), { timeout: 60000 }).toBeGreaterThan(0);
    await showTries();
    await expect.poll(() => tiles().count()).toBe(1);
    await tiles().filter({ hasText: 'robot.mcap' }).click();
    await expect.poll(() => recordingPanels(), { timeout: 30000 }).not.toBeNull();

    const panels = (await recordingPanels())!;
    const log = panels.find((p) => p.kind === 'log')!;
    const imu = panels.find((p) => p.id === 'imu')!;

    expect(log.entries).toContainEqual({ level: 'warn', text: 'Wrist torque near limit' });
    expect(imu.samples).toEqual([IMU_SAMPLES, IMU_SAMPLES, IMU_SAMPLES]);

    await app.page.keyboard.press('End');

    const warning = app.page.locator(shown('[data-kind="log"] [data-testid="log-entry"][data-level="warn"]'));

    await expect.poll(() => warning.count(), { timeout: 30000 }).toBe(1);
    expect(await warning.textContent()).toContain('Wrist torque near limit');
    expect(await app.page.locator(shown('[data-panel="imu"] [data-testid="plot"]')).getAttribute('data-samples')).toBe(
      String(3 * IMU_SAMPLES),
    );
    await app.page.keyboard.press('Escape');
    expect(app.requests.filter((url) => url.includes('/api/bridge/hub-model-file'))).toEqual([]);
    expect(app.errors).toEqual([]);
  });
});

it('imports FlatBuffers through Import and reads its nested message, plot and states from Library', async () => {
  const robot = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
  const bytes = await flatRecording(JOINTS);

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: 'FlatBuffers arm',
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
  await app.page.evaluate(
    (picked) => (window as unknown as { __studio: Studio }).__studio.pickFiles(picked),
    [{ name: 'telemetry.mcap', base64: base64(bytes) }],
  );
  await app.page.keyboard.press('ControlOrMeta+k');
  await app.page.keyboard.type('Import');
  await app.page
    .locator(shown('button[data-idx]'))
    .filter({ hasText: 'Import' })
    .filter({ hasNotText: 'Robot' })
    .click();
  await expect.poll(() => app.page.getByText('Imported 1 try', { exact: true }).count()).toBeGreaterThan(0);
  await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
  await app.page.locator(shown('[data-testid="library-tries"] button')).first().click();
  await app.page.locator(shown('[data-testid="try-tile"]')).filter({ hasText: 'telemetry.mcap' }).click();

  const message = app.page.locator(shown('[data-testid="message-tree"][data-topic="/telemetry"]'));

  await expect.poll(() => message.count()).toBe(1);
  await app.page.keyboard.press('End');
  await expect.poll(() => message.textContent()).toContain('wrist-2');
  expect(await message.textContent()).toContain('18446744073709551615');
  expect(await app.page.locator(shown('[data-panel="plot"] [data-testid="plot"]')).getAttribute('data-samples')).toBe(
    '3',
  );
  expect(
    await app.page
      .locator(shown('[data-testid="state-span"]'))
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-value'))),
  ).toEqual(['Idle', 'Moving', 'Idle']);
  await app.page.keyboard.press('Home');
  await expect.poll(() => message.textContent()).toContain('wrist-0');
  await app.page.keyboard.press('Escape');
  await app.page.evaluate(
    (picked) => (window as unknown as { __studio: Studio }).__studio.pickFiles(picked),
    [{ name: 'telemetry.mcap', base64: base64(bytes) }],
  );
  await app.page.keyboard.press('ControlOrMeta+k');
  await app.page.keyboard.type('Import');
  await app.page
    .locator(shown('button[data-idx]'))
    .filter({ hasText: 'Import' })
    .filter({ hasNotText: 'Robot' })
    .click();
  await expect.poll(() => app.page.getByText('Imported 0 tries', { exact: true }).count()).toBeGreaterThan(0);
  expect(await app.page.locator(shown('[data-testid="try-tile"]')).count()).toBe(1);
  expect(app.requests.filter((url) => url.includes('/api/bridge/hub-model-file'))).toEqual([]);
  expect(app.errors).toEqual([]);
});
