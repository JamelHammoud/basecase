import { parquetReadObjects } from 'hyparquet';
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import type { Page } from 'playwright-core';
import { expect } from 'vitest';
import { buildCase, builderRobot } from '../src/cases/caseBuilder';
import type { ReferenceCommand } from '../src/cases/schema';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { buildRig } from '../src/utils/kinematics';
import type { FakeHub } from './fakeHub';
import { shown } from './harness';

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
