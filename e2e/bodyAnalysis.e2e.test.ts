import loadMujoco from '@mujoco/mujoco';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { recordedBodyRun } from '../src/reality/bodyFit.fixtures';
import type { RobotRun } from '../src/robot/runBuffer';
import type { SimModel } from '../src/sim/mjcfTypes';
import { analysisArmScene } from '../src/reality/bodyAnalysisMatrix.fixtures';
import { openApp, openPlayTab, type App } from './harness';

interface Studio {
  load: (scene: unknown) => void;
  attachRobot: (link: unknown) => void;
  bodyModel: () => Promise<SimModel>;
  seedBodyEvidence: (input: { run: RobotRun; id: string; analyzed?: boolean }) => Promise<void>;
  bodyCalibrations: () => unknown;
  bodyChecks: () => Promise<unknown>;
  sceneRecord: () => { parts: unknown[]; project: Record<string, unknown> };
  editBodyEvidenceSource: () => void;
}

const studio = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.bodyCalibrations());
let app: App;
const commandCount = () => app.page.evaluate(() => (window as unknown as { __bodyCommands: number }).__bodyCommands);
let baseline: { parts: unknown[]; project: Record<string, unknown> };

beforeAll(async () => {
  app = await openApp();
  await app.page.evaluate(() => {
    const target = window as unknown as { __studio: Studio; __bodyCommands: number };

    target.__bodyCommands = 0;
    target.__studio.attachRobot({
      onRobotEvent: () => () => undefined,
      robotUnits: async () => [],
      robotCommand: async () => {
        target.__bodyCommands++;

        return { ok: true };
      },
    });
  });
  await app.page.evaluate((scene) => (window as unknown as { __studio: Studio }).__studio.load(scene), {
    ...analysisArmScene(true),
    id: 'body-analysis-scene',
  });
  await openPlayTab(app.page, 'Operate');

  const model = await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.bodyModel());
  const run = recordedBodyRun(await loadMujoco(), model);

  await app.page.evaluate(async (run) => {
    const studio = (window as unknown as { __studio: Studio }).__studio;

    await studio.seedBodyEvidence({ run, id: 'body-analysis-history', analyzed: true });
    await studio.seedBodyEvidence({ run, id: 'body-analysis-arm' });
  }, run);
  baseline = await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord());
}, 120000);

beforeEach(async () => {
  await app.page.keyboard.press('Escape');
  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    ...baseline,
    id: 'body-analysis-scene',
  });
  await openPlayTab(app.page, 'Operate');
});

afterAll(async () => {
  await app?.close();
});

describe('recorded body parameter analysis', () => {
  it(
    'analyzes a retained arm through Operate without changing calibration or issuing commands',
    { retry: 0, timeout: 15000 },
    async () => {
      const before = await studio();
      const beforeCommands = await commandCount();
      const beforeScene = await app.page.evaluate(() =>
        (window as unknown as { __studio: Studio }).__studio.sceneRecord(),
      );
      const beforeChecks = await app.page.evaluate(() =>
        (window as unknown as { __studio: Studio }).__studio.bodyChecks(),
      );

      await app.page.getByRole('button', { name: 'Analyze Try', exact: true }).filter({ visible: true }).click();
      await app.page.getByRole('combobox', { name: 'Try' }).selectOption('body-analysis-arm');
      await app.page.getByRole('button', { name: 'Analyze', exact: true }).click();
      await app.page.locator('[data-body-parameter="payloadKg"]').waitFor();
      expect(await app.page.locator('[data-testid="body-analysis"]').textContent()).toContain('body-analysis-arm');
      expect(await app.page.locator('[data-distinguishability="distinguishable"]').count()).toBeGreaterThan(0);
      expect(await app.page.locator('[data-distinguishability="coupled"]').count()).toBeGreaterThanOrEqual(2);
      expect(await studio()).toEqual(before);
      expect(await commandCount()).toBe(beforeCommands);

      const afterScene = await app.page.evaluate(() =>
        (window as unknown as { __studio: Studio }).__studio.sceneRecord(),
      );

      expect(afterScene.parts).toEqual(beforeScene.parts);
      expect({ ...afterScene.project, bodyEvidence: undefined }).toEqual({
        ...beforeScene.project,
        bodyEvidence: undefined,
      });
      expect(await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.bodyChecks())).toEqual(
        beforeChecks,
      );
      await app.page.keyboard.press('Escape');
    },
  );

  it(
    'reopens historical evidence and removes applicability after a source edit',
    { retry: 0, timeout: 15000 },
    async () => {
      await app.page.getByRole('button', { name: 'Analyze Try', exact: true }).filter({ visible: true }).click();
      await app.page.getByRole('combobox', { name: 'Try' }).selectOption('body-analysis-history');
      await app.page.getByText('Current source', { exact: true }).waitFor();
      await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.editBodyEvidenceSource());
      await app.page.getByText('Out of date', { exact: true }).waitFor();
      expect(await app.page.locator('[data-testid="body-analysis"]').getAttribute('data-applicable')).toBe('false');
      expect(await app.page.locator('[data-body-parameter]').count()).toBeGreaterThan(0);
      expect(await commandCount()).toBe(0);
      await app.page.keyboard.press('Escape');
    },
  );
});
