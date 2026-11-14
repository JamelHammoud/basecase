import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withLidar } from '../src/sim/fixtures/parts';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { endTryAt, loadFixtureRobot } from './driveChecks';
import { openApp, openPlayTab, shown, type App } from './harness';

let app: App;

interface DataLayer {
  id: string;
  kind: string;
  visible: boolean;
  points: number;
  shownAt: number | null;
}

interface DataState {
  drive: string;
  activeCase: string | null;
  tries: unknown[];
  scanPoints: number;
  dataLayers: DataLayer[];
  dataPlayhead: number | null;
  timeline: { frames: number; sought: number | null } | null;
}

const simState = () =>
  app.page.evaluate(() => (window as unknown as { __studio: { simState: () => DataState } }).__studio.simState());

const button = (name: string) => app.page.locator(shown('button'), { hasText: name }).first();

const scanLayer = async () => (await simState()).dataLayers.find((l) => l.kind === 'scan');

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Data layers', () => {
  it.skipIf(process.platform === 'win32')(
    'hides a rover’s LiDAR scan from Layers while it drives, and replays the scan at the playhead',
    async () => {
      const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;

      await loadFixtureRobot(app.page, withLidar(rover, 'slamtec-rplidar-s2'));
      await openPlayTab(app.page, 'Cases');
      await button('New Case').click();

      const card = app.page.locator(shown('[data-testid="new-case"]'));

      await card.locator('[role=radio]', { hasText: 'Reach a Spot' }).click();
      await card.locator('[role=radio]', { hasText: 'Corridor' }).click();
      await card.locator('button', { hasText: 'Make Case' }).click();
      await expect.poll(async () => (await simState()).activeCase).toBe('reach-a-spot-in-a-corridor');
      await button('Try It').click();
      await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
      await expect.poll(async () => (await simState()).scanPoints, { timeout: 30000 }).toBeGreaterThan(0);

      const live = (await scanLayer())!;

      await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Layers"]')).first().click();

      const row = app.page.locator(shown(`[data-layer-row="data:${live.id}"]`)).first();

      await row.hover();
      await row.locator('button[aria-label="Hide"]').click();
      await expect.poll(async () => (await scanLayer())?.visible).toBe(false);
      await expect.poll(() => row.getAttribute('data-visible')).toBe('false');
      expect((await simState()).scanPoints).toBe(0);
      await row.locator('button[aria-label="Show"]').click();
      await expect.poll(async () => (await scanLayer())?.visible).toBe(true);
      await openPlayTab(app.page, 'Cases');
      await endTryAt(app.page, 0.4);
      await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);

      await app.page.getByTestId('try-row').first().locator('button[aria-label="Replay"]').click();
      await expect.poll(async () => (await simState()).timeline?.sought, { timeout: 30000 }).toBe(0);
      await app.page.keyboard.press('End');

      const { frames } = (await simState()).timeline!;

      await expect.poll(async () => (await simState()).timeline?.sought).toBe(frames - 1);
      await expect.poll(async () => (await scanLayer())?.points ?? 0).toBeGreaterThan(0);

      const end = await simState();
      const layer = end.dataLayers.find((l) => l.kind === 'scan')!;

      expect(end.dataPlayhead).toBeGreaterThan(0);
      expect(layer.shownAt).toBeLessThanOrEqual(end.dataPlayhead!);
      expect(app.errors).toEqual([]);
    },
  );
});
