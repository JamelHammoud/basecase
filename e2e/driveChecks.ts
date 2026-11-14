import { parquetReadObjects } from 'hyparquet';
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import type { Page } from 'playwright-core';
import { expect } from 'vitest';
import { buildCase, builderRobot } from '../src/cases/caseBuilder';
import { robotFacts } from '../src/cases/robotFit';
import { DEMO_CONTROL_DT } from '../src/datasets/demos';
import { obsSize, POLICY_FORMAT, POLICY_VERSION, type PolicySpec } from '../src/sim/policy';
import type { ReferenceCommand } from '../src/cases/schema';
import type { FixtureRobot } from '../src/sim/fixtures/parts';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { solveIK } from '../src/utils/kinematicsIk';
import type { FakeHub } from './fakeHub';
import type { SimState, Studio } from './driveStudio';
import { partCount, shown } from './harness';

export async function expectDataset(files: Record<string, Buffer>) {
  const paths = Object.keys(files);
  const at = (end: string) => files[paths.find((p) => p.endsWith(end))!];
  const rows = await parquetReadObjects({ file: new Uint8Array(at('data/chunk-000/episode_000000.parquet')).buffer });
  const info = JSON.parse(at('meta/info.json').toString());
  const videos = paths.filter((p) => p.endsWith('.mp4'));

  expect(paths.some((p) => p.endsWith('meta/modality.json'))).toBe(true);
  expect(info.total_frames).toBe(rows.length);
  expect(rows[0]['observation.state']).toHaveLength(3);
  expect(videos.map((p) => p.split('/').at(-2))).toEqual(['observation.images.scene']);

  for (const path of videos) {
    const input = new Input({ source: new BufferSource(new Uint8Array(files[path])), formats: ALL_FORMATS });
    const track = (await input.getPrimaryVideoTrack())!;
    const stats = await track.computePacketStats();

    expect([track.displayWidth, track.displayHeight]).toEqual([640, 480]);
    expect(stats.packetCount).toBe(rows.length);
    expect(info.features['observation.images.scene'].info['video.codec']).toMatch(/h264|vp9|av1/);
  }
}

export async function expectPublished(hub: FakeHub, repo: string) {
  const published = hub.repos.get(repo)!;
  const paths = [...published.files.keys()];
  const parquet = published.files.get('data/chunk-000/episode_000000.parquet')!;
  const rows = await parquetReadObjects({ file: new Uint8Array(parquet).buffer });
  const info = JSON.parse(published.files.get('meta/info.json')!.toString());

  expect(published.kind).toBe('dataset');
  expect(paths).toEqual(expect.arrayContaining(['meta/info.json', 'meta/modality.json', 'meta/episodes.jsonl']));
  expect(paths.filter((p) => p.endsWith('.mp4'))).toEqual([
    'videos/chunk-000/observation.images.scene/episode_000000.mp4',
  ]);
  expect(info.total_frames).toBe(rows.length);
  await expect.poll(() => published.tags.get('v2.1')).toBe(published.commits.length);
  expect(hub.requests.filter((r) => r.method === 'PUT').every((r) => r.auth === undefined)).toBe(true);
}

export function pickTimeline(): ReferenceCommand[] {
  const arm = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
  const built = buildCase({ goal: 'pick', world: 'floor' }, builderRobot(buildRig(arm.joints, arm.parts), arm.parts));

  if (!built.ok) throw new Error(built.problem);

  return built.kase.reference.timeline;
}

export async function expectCaseCheckOpensRow(page: Page, name: string) {
  const verdict = page.locator(shown('[data-testid="case-check"]'));

  expect(await page.locator(shown('button'), { hasText: 'Check Fit' }).count()).toBe(0);
  expect(await page.getByTestId('robot-fit').count()).toBe(0);
  await expect.poll(() => verdict.count(), { timeout: 120000 }).toBe(1);
  expect(['pass', 'warn', 'fail']).toContain(await verdict.getAttribute('data-status'));
  await verdict.click();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id ?? ''), { timeout: 10000 })
    .toMatch(/^case-check-/);
  expect(await page.locator(shown('[id^="case-check-"]')).innerText()).toContain(name);
}

export function expectGenerated(files: Record<string, Buffer>, kept: number) {
  const at = (end: string) => JSON.parse(files[Object.keys(files).find((p) => p.endsWith(end))!].toString());
  const episodes = at('meta/basecase.json').episodes as Array<{ seed: number; source: string | null }>;
  const generated = episodes.filter((e) => e.source !== null);

  expect(at('meta/info.json').total_episodes).toBe(1 + kept);
  expect(generated).toHaveLength(kept);
  expect(new Set(generated.map((e) => e.seed)).size).toBe(kept);
  expect(Object.keys(files).filter((p) => p.endsWith('.mp4'))).toHaveLength(1 + kept);
}

export function touchingPolicy(): PolicySpec {
  const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
  const rig = buildRig(arm.joints, arm.parts);
  const made = buildCase({ goal: 'touch', world: 'floor' }, builderRobot(rig, arm.parts));

  if (!made.ok) throw new Error(made.problem);

  const facts = robotFacts(rig, arm.parts);
  const hand = facts.endEffector!;
  const target = made.kase.world.objects.find((o) => o.id === 'point')!.position;
  const solved = solveIK(rig, {}, [{ partId: hand.part, point: hand.point, target }], { joints: facts.armJoints });
  const joints = rig.robots[0].joints.map((id) => rig.byId.get(id)!);
  const pose = joints.map((j) =>
    j.type === 'revolute' ? ((solved.values[j.id] ?? 0) * Math.PI) / 180 : (solved.values[j.id] ?? 0) / 1000,
  );
  const scale = Math.max(0.25, ...pose.map((v) => Math.abs(v) * 1.1));
  const size = obsSize(joints.length);

  return {
    format: POLICY_FORMAT,
    version: POLICY_VERSION,
    task: 'stand',
    robot: rig.robots[0].key,
    joints: joints.map((j) => j.id),
    defaultPose: joints.map(() => 0),
    actionScale: scale,
    controlDt: DEMO_CONTROL_DT,
    command: [0, 0, 0],
    obsMean: new Array<number>(size).fill(0),
    obsStd: new Array<number>(size).fill(1),
    layers: [
      {
        in: size,
        out: joints.length,
        w: new Array<number>(size * joints.length).fill(0),
        b: pose.map((v) => v / scale),
      },
    ],
    activation: 'elu',
    trainedSteps: 1,
    mujoco: 'e2e',
    createdAt: '2026-11-13T00:00:00Z',
  };
}

export async function endTryAt(page: Page, seconds: number) {
  await page.evaluate(async (at) => {
    const clock = () =>
      [...document.querySelectorAll('[data-testid="try-clock"]')].find((el) => !el.closest('[inert]'));
    const elapsed = () => Number.parseFloat(clock()?.textContent ?? '') || 0;
    const deadline = Date.now() + 30000;

    while (elapsed() < at) {
      if (Date.now() > deadline) throw new Error(`The try clock never reached ${at} s`);

      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    clock()?.parentElement?.querySelector('button')?.click();
  }, seconds);
}

export async function datasetFiles(page: Page) {
  const files = await page.evaluate(() =>
    (
      window as unknown as { __studio: { datasetFiles: () => Promise<Record<string, string> | null> } }
    ).__studio.datasetFiles(),
  );

  return Object.fromEntries(Object.entries(files ?? {}).map(([path, b64]) => [path, Buffer.from(b64, 'base64')]));
}

export async function passedDatasetFiles(page: Page) {
  const triesPassed = () =>
    page.evaluate(() =>
      ((window as unknown as { __studio: Studio }).__studio.simState() as SimState).tries.every((t) => t.passed),
    );

  await page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.passTries());
  await expect.poll(triesPassed).toBe(true);

  return datasetFiles(page);
}

export async function loadFixtureRobot(page: Page, id: string | FixtureRobot) {
  const robot = typeof id === 'string' ? fixtureRobots().find((r) => r.id === id)! : id;

  await page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: robot.id,
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
  });
  await expect.poll(() => partCount(page)).toBe(robot.parts.length);
}
