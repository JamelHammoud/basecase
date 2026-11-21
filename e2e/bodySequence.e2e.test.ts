import loadMujoco from '@mujoco/mujoco';
import { replayBody } from '../src/reality/bodyReplay';
import { emptyBodyFit } from '../src/reality/bodyParameters';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { openApp, openPlayTab, shown, type App } from './harness';
import { analysisArmScene } from '../src/reality/bodyAnalysisMatrix.fixtures';
import { parkedBodyRun } from '../src/reality/bodyMotion.fixtures';
import { attachBodyMotionRobot, type BodyMotionStudio } from './bodyMotionHarness';
import type { BodyHistory } from '../src/reality/bodyTypes';
import { expectBodyMotionLayout, narrowBodyMotionPanel } from './bodyMotionLayout';

let app: App;

function activeBodies(value: unknown) {
  const histories = (value ?? {}) as Record<string, BodyHistory>;

  return Object.fromEntries(
    Object.entries(histories).flatMap(([robot, history]) =>
      history.active === null
        ? []
        : [[robot, history.versions.find((version) => version.version === history.active)?.fit]],
    ),
  );
}

async function countSequenceSubmissions() {
  await app.page.evaluate(() => {
    const target = window as unknown as { sequenceSubmissions: number };
    const send = Worker.prototype.postMessage;

    target.sequenceSubmissions = 0;
    Worker.prototype.postMessage = function (request: unknown, transfer?: Transferable[] | StructuredSerializeOptions) {
      const message = (request ?? {}) as { op?: string };

      if (['prepareSequence', 'advanceSequence', 'validateSequence'].includes(message.op ?? ''))
        target.sequenceSubmissions++;

      Reflect.apply(send, this, [request, transfer ?? []]);
    };
  });
}

beforeAll(async () => {
  app = await openApp();
  await attachBodyMotionRobot(app);
  await narrowBodyMotionPanel(app.page);
  await app.page.evaluate((scene) => (window as unknown as { __studio: BodyMotionStudio }).__studio.load(scene), {
    ...analysisArmScene(true),
    id: 'body-sequence-scene',
  });
  await openPlayTab(app.page, 'Operate');

  const model = await app.page.evaluate(() =>
    (window as unknown as { __studio: BodyMotionStudio }).__studio.bodyModel(),
  );

  const run = parkedBodyRun(model);
  const positions = replayBody({ model, robot: model.robots[0].key, run, mj: await loadMujoco() }, emptyBodyFit());

  run.statuses = run.statuses.map((status, frame) => ({ ...status, positions: positions[frame] }));

  await app.page.evaluate(
    async ({ model, run }) => {
      await (window as unknown as { __studio: BodyMotionStudio }).__studio.seedBodyEvidence({
        model,
        run,
        id: 'body-sequence-source',
        generated: true,
      });
    },
    { model, run },
  );
});

afterAll(async () => app?.close());

it(
  'retains two simulated observations, stops further work and reopens their evidence without changing the incumbent',
  { retry: 0, timeout: 15000 },
  async () => {
    const { page } = app;
    const before = await page.evaluate(() =>
      (window as unknown as { __studio: BodyMotionStudio }).__studio.bodyCalibrations(),
    );

    await page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
    await page.locator(shown('[data-testid="library-tries"] button')).first().click();
    await page.locator(shown('[data-testid="try-tile"][data-try="body-sequence-source"]')).click();
    await openPlayTab(page, 'Operate');
    await page.getByRole('button', { name: 'Analyze Try', exact: true }).filter({ visible: true }).click();
    await page.getByRole('combobox', { name: 'Try' }).selectOption('body-sequence-source');
    await page.getByRole('button', { name: 'Analyze', exact: true }).click();

    const switches = page.getByRole('dialog', { name: 'Analyze Try' }).getByRole('switch');

    await switches.first().waitFor();

    for (const toggle of await switches.all()) await toggle.click();

    await page.evaluate(() => {
      const send = Worker.prototype.postMessage;

      Worker.prototype.postMessage = function (
        message: unknown,
        transfer?: Transferable[] | StructuredSerializeOptions,
      ) {
        const request = message as { op?: string; payload?: { sequence?: { rounds?: unknown[] } } };

        if (request.op === 'advanceSequence' && request.payload?.sequence?.rounds?.length === 2) return;

        Reflect.apply(send, this, [message, transfer ?? []]);
      };
    });
    await page.getByRole('button', { name: 'Simulated Sequence', exact: true }).click();
    await page.locator('[data-body-sequence]').getByRole('button', { name: 'Run', exact: true }).click();
    await page.locator('[data-body-sequence-round="2"]').waitFor();
    await expectBodyMotionLayout(page);
    await page.locator('[data-body-sequence]').getByRole('button', { name: 'Stop', exact: true }).click();
    await page.locator('[data-body-sequence-reason="cancelled"]').waitFor();

    expect(await page.locator('[data-body-sequence-round]').count()).toBe(2);

    for (const index of [1, 2]) {
      const round = page.locator(`[data-body-sequence-round="${index}"]`);

      await round.locator('summary').click();
      await round.locator('[data-recording]').click();
      await page.locator('[data-body-observations]').waitFor();
      await page.getByRole('combobox', { name: 'Try' }).selectOption('body-sequence-source');
    }

    const record = await page.evaluate(() =>
      (window as unknown as { __studio: BodyMotionStudio }).__studio.sceneRecord(),
    );

    await page.keyboard.press('Escape');
    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as { __studio?: BodyMotionStudio }).__studio);
    await attachBodyMotionRobot(app);
    await page.evaluate((record) => (window as unknown as { __studio: BodyMotionStudio }).__studio.load(record), {
      ...record,
      id: 'body-sequence-scene',
    });
    await openPlayTab(page, 'Operate');
    await countSequenceSubmissions();
    await page.getByRole('button', { name: 'Analyze Try', exact: true }).filter({ visible: true }).click();
    await page.getByRole('combobox', { name: 'Try' }).selectOption('body-sequence-source');
    await page.locator('[data-body-sequence-reason="cancelled"]').waitFor();
    expect(await page.locator('[data-body-sequence-round]').count()).toBe(2);
    expect(
      await page.locator('[data-body-sequence]').getByRole('button', { name: 'Run', exact: true }).isVisible(),
    ).toBe(false);
    expect(
      await page.evaluate(() => (window as unknown as { __studio: BodyMotionStudio }).__studio.bodyCalibrations()),
    ).toEqual(before);
    expect(await page.evaluate(() => (window as unknown as { sequenceSubmissions: number }).sequenceSubmissions)).toBe(
      0,
    );
    await page.locator('[data-body-sequence]').getByRole('button', { name: 'Fit Body', exact: true }).click();
    await page.locator('[data-body-sequence]').getByText('Can’t tell.', { exact: true }).waitFor();
    expect(
      activeBodies(
        await page.evaluate(() => (window as unknown as { __studio: BodyMotionStudio }).__studio.bodyCalibrations()),
      ),
    ).toEqual(activeBodies(before));
    expect(app.errors).toEqual([]);
  },
);
