import { parquetReadObjects } from 'hyparquet';
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import type { Page } from 'playwright-core';
import { expect } from 'vitest';
import { buildCase, builderRobot } from '../src/cases/caseBuilder';
import type { ReferenceCommand } from '../src/cases/schema';
import type { FixtureRobot } from '../src/sim/fixtures/parts';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { filesAtTag, type FakeHub } from './fakeHub';
import type { SimState, Studio } from './driveStudio';
import { partCount, shown } from './harness';

export const inDataset = (files: Record<string, Buffer>) =>
  Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path.slice(path.indexOf('/') + 1), bytes]));

const parquetRows = (bytes: Buffer) => parquetReadObjects({ file: new Uint8Array(bytes).buffer });

async function expectVideo(bytes: Buffer, frames: number) {
  const input = new Input({ source: new BufferSource(new Uint8Array(bytes)), formats: ALL_FORMATS });
  const track = (await input.getPrimaryVideoTrack())!;
  const stats = await track.computePacketStats();

  expect([track.displayWidth, track.displayHeight]).toEqual([640, 480]);
  expect(stats.packetCount).toBe(frames);
}

export async function expectDataset(zipped: Record<string, Buffer>) {
  const files = inDataset(zipped);
  const rows = await parquetRows(files['data/chunk-000/file-000.parquet']);
  const legacyRows = await parquetRows(files['v2.1/data/chunk-000/episode_000000.parquet']);
  const info = JSON.parse(files['meta/info.json'].toString());
  const videos = Object.keys(files).filter((p) => p.endsWith('.mp4'));

  expect(info.codebase_version).toBe('v3.0');
  expect(files['v2.1/meta/modality.json']).toBeDefined();
  expect(info.total_frames).toBe(rows.length);
  expect(legacyRows).toHaveLength(rows.length);
  expect(rows[0]['observation.state']).toHaveLength(3);
  expect(info.features['observation.images.scene'].info['video.codec']).toMatch(/h264|vp9|av1/);
  expect(videos.sort()).toEqual([
    'v2.1/videos/chunk-000/observation.images.scene/episode_000000.mp4',
    'videos/observation.images.scene/chunk-000/file-000.mp4',
  ]);

  for (const path of videos) await expectVideo(files[path], rows.length);
}

export async function expectPublished(hub: FakeHub, repo: string) {
  const published = hub.repos.get(repo)!;
  const paths = [...published.files.keys()];

  await expect.poll(() => published.tags.get('v3.0')).toBe(published.commits.length);
  expect(published.tags.get('v2.1')).toBe(published.commits.length - 1);

  const legacy = filesAtTag(published, 'v2.1');
  const rows = await parquetRows(published.files.get('data/chunk-000/file-000.parquet')!);
  const info = JSON.parse(published.files.get('meta/info.json')!.toString());
  const legacyInfo = JSON.parse(legacy.get('meta/info.json')!.toString());

  expect(published.kind).toBe('dataset');
  expect(info.codebase_version).toBe('v3.0');
  expect(info.total_frames).toBe(rows.length);
  expect(paths).toEqual(expect.arrayContaining(['meta/tasks.parquet', 'meta/episodes/chunk-000/file-000.parquet']));
  expect(paths.filter((p) => p.endsWith('.jsonl') || p.endsWith('modality.json'))).toEqual([]);
  expect(paths.filter((p) => p.endsWith('.mp4'))).toEqual(['videos/observation.images.scene/chunk-000/file-000.mp4']);
  expect(legacyInfo).toMatchObject({ codebase_version: 'v2.1', total_frames: rows.length });
  expect([...legacy.keys()]).toEqual(
    expect.arrayContaining([
      'meta/modality.json',
      'meta/episodes.jsonl',
      'data/chunk-000/episode_000000.parquet',
      'videos/chunk-000/observation.images.scene/episode_000000.mp4',
    ]),
  );
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
