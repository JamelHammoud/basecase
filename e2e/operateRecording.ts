import { expect, vi } from 'vitest';
import { shown, type App } from './harness';

interface SavedRecording {
  arg?: { manifest?: { id: string; source: string; ended?: string }; recording?: string | null };
}

interface RecordingWindow {
  __studio: { tryLanes: (id: string) => Promise<Record<string, number[]> | null> };
}

export async function expectOperateRecording(
  app: App,
  joints: string[],
  statuses: Array<Array<number | null>>,
  savedAfter: number,
) {
  const saved = () =>
    app.posts
      .slice(savedAfter)
      .filter((post) => post.route === 'tries-save')
      .map((post) => (post.body as SavedRecording).arg)
      .find((arg) => arg?.manifest?.source === 'operate' && arg.manifest.ended === 'fault' && arg.recording);

  await expect.poll(saved).toBeDefined();

  const id = saved()!.manifest!.id;
  const { page } = app;
  const library = page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]'));

  if ((await library.getAttribute('aria-pressed')) !== 'true') await library.click();

  await page.locator(shown('[data-testid="library-tries"] button')).first().click();

  const tile = page.locator(shown(`[data-testid="try-tile"][data-try="${id}"]`));

  await expect.poll(() => tile.count()).toBe(1);
  expect(await tile.textContent()).toContain('Operate');

  const lanes = await vi.waitFor(async () => {
    const found = await page.evaluate((tryId) => (window as unknown as RecordingWindow).__studio.tryLanes(tryId), id);

    expect(found).not.toBeNull();

    return found!;
  });

  expect(statuses.length).toBeGreaterThanOrEqual(25);

  joints.forEach((joint, k) => {
    expect(lanes[joint]).toHaveLength(statuses.length);
    lanes[joint].forEach((q, n) =>
      expect(q).toBeCloseTo(((statuses[n][k] ?? 2048) - 2048) * ((2 * Math.PI) / 4096), 3),
    );
  });
  expect(Math.max(...lanes[joints[0]]) - Math.min(...lanes[joints[0]])).toBeGreaterThan(0.05);
}
