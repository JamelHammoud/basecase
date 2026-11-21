import { afterEach, beforeEach, expect, it } from 'vitest';
import { writeMcap, type FixtureMessage } from '../src/datasets/import/mcapFixtures';
import { openApp, shown, type App } from './harness';

let app: App;

async function command(label: string) {
  await app.page.keyboard.press('ControlOrMeta+k');
  await app.page.getByLabel('Search commands').fill(label);
  await app.page.locator(shown('button[data-idx]')).filter({ hasText: label }).first().click();
}

async function importRun(name: string, values: number[], states: string[], rgb: number[]) {
  const messages: FixtureMessage[] = values.flatMap((value, i) =>
    [
      { topic: '/imu', schema: 'sensor_msgs/msg/Imu', payload: { angular_velocity: { x: value, y: 0, z: 0 } } },
      { topic: '/mode', schema: 'std_msgs/msg/String', payload: { data: states[i] } },
      {
        topic: '/camera',
        schema: 'sensor_msgs/msg/Image',
        payload: { width: 2, height: 1, step: 6, encoding: 'rgb8', data: [...rgb, ...rgb] },
      },
      {
        topic: '/scan',
        schema: 'sensor_msgs/msg/LaserScan',
        payload: {
          header: { frame_id: 'laser' },
          angle_min: 0,
          angle_increment: 1,
          range_min: 0.1,
          range_max: 10,
          ranges: [1 + i],
        },
      },
    ].map(({ topic, schema, payload }) => ({
      topic,
      schema,
      encoding: 'json',
      schemaEncoding: 'jsonschema',
      schemaData: new TextEncoder().encode('{}'),
      logTime: BigInt(1_700_000_000 + i) * 1_000_000_000n,
      data: new TextEncoder().encode(JSON.stringify(payload)),
    })),
  );
  const bytes = await writeMcap(messages);

  await app.page.evaluate(
    (file) => {
      const studio = (window as unknown as { __studio: { pickFiles: (files: unknown[]) => void } }).__studio;

      studio.pickFiles([file]);
    },
    { name, base64: Buffer.from(bytes).toString('base64') },
  );
  await command('Import');
  await expect.poll(() => app.page.getByText('Imported 1 try', { exact: true }).count()).toBeGreaterThan(0);
}

beforeEach(async () => {
  app = await openApp();
}, 120000);
afterEach(async () => {
  await app?.close();
});

it('compares two ordinary MCAP imports, aligns events and reopens an unchanged original', { retry: 0 }, async () => {
  await importRun('before.mcap', [0.1, 0.2, 0.4], ['idle', 'trigger', 'run'], [255, 0, 0]);
  await importRun('after.mcap', [0.8, 0.9, 1.5], ['idle', 'idle', 'trigger'], [0, 255, 0]);
  await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
  await app.page.locator(shown('[data-testid="library-tries"] button')).first().click();

  const tiles = app.page.locator(shown('[data-testid="try-tile"]'));
  const before = tiles.filter({ hasText: 'before.mcap' });
  const after = tiles.filter({ hasText: 'after.mcap' });
  const id = await before.getAttribute('data-try');

  await before.click({ modifiers: ['ControlOrMeta'] });
  await after.click({ modifiers: ['ControlOrMeta'] });
  expect(await app.page.getByRole('button', { name: 'Compare Tries', exact: true }).count()).toBe(1);
  await command('Compare Tries');

  const sources = app.page.locator('[data-testid="comparison-source"]');
  const a = sources.filter({ hasText: 'before.mcap' }).first();
  const b = sources.filter({ hasText: 'after.mcap' }).first();
  const numeric = (source: typeof a) =>
    source.locator('[data-testid="comparison-value"][data-signal="topic./imu.angular_velocity.x"]');
  const state = (source: typeof a) => source.locator('[data-testid="comparison-state"] output');

  await expect.poll(() => sources.count()).toBe(2);

  const hash = await a.getAttribute('data-origin-hash');

  await expect.poll(() => numeric(a).textContent()).toContain('0.1');
  await expect.poll(() => numeric(b).textContent()).toContain('0.8');

  const pixel = (source: typeof a) =>
    source.locator('[data-testid="comparison-camera"] canvas').evaluate((node) => {
      const canvas = node as HTMLCanvasElement;
      const copy = document.createElement('canvas');

      copy.width = canvas.width;
      copy.height = canvas.height;

      const context = copy.getContext('2d')!;

      context.drawImage(canvas, 0, 0);

      return Array.from(context.getImageData(0, 0, 1, 1).data);
    });

  await expect.poll(() => pixel(a)).toEqual([255, 0, 0, 255]);
  await expect.poll(() => pixel(b)).toEqual([0, 255, 0, 255]);
  await expect.poll(() => a.locator('[data-testid="comparison-spatial"]').getAttribute('data-frame')).toBe('laser');
  await expect
    .poll(() => b.locator('[data-testid="comparison-spatial"] canvas').getAttribute('data-retained-bytes'))
    .toBe('524288');

  await app.page.getByRole('button', { name: 'Compare Signals', exact: true }).click();
  await expect.poll(() => app.page.getByTestId('comparison-difference').textContent()).toContain('0.7');
  await app.page.getByRole('button', { name: 'Compare Signals', exact: true }).click();

  await a.getByLabel('Align event').selectOption({ label: 'topic./mode.data: trigger' });
  await b.getByLabel('Align event').selectOption({ label: 'topic./mode.data: trigger' });
  await expect.poll(() => numeric(a).textContent()).toContain('0.2');
  await expect.poll(() => numeric(b).textContent()).toContain('1.5');
  await expect.poll(() => state(a).textContent()).toBe('trigger');
  await expect.poll(() => state(b).textContent()).toBe('trigger');
  await app.page.locator('[data-testid="try-timeline"]').focus();
  await app.page.keyboard.press('Home');
  await app.page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => numeric(a).textContent()).toContain('0.1');
  await expect.poll(() => numeric(b).textContent()).toContain('0.9');
  await expect.poll(() => state(a).textContent()).toBe('idle');
  await expect.poll(() => state(b).textContent()).toBe('idle');
  await app.page.keyboard.press('Escape');
  await before.click();
  await expect.poll(() => sources.count()).toBe(1);
  expect(await sources.first().getAttribute('data-try')).toBe(id);
  expect(await sources.first().getAttribute('data-origin-hash')).toBe(hash);
  await expect.poll(() => numeric(sources.first()).textContent()).toContain('0.1');
  await app.page.keyboard.press('End');
  await expect.poll(() => numeric(sources.first()).textContent()).toContain('0.4');
  expect(app.errors).toEqual([]);
});
