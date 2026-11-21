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
  seedBodyEvidence: (input: { run: RobotRun; model: SimModel; id: string; analyzed?: boolean }) => Promise<void>;
  bodyCalibrations: () => unknown;
  bodyChecks: () => Promise<unknown>;
  sceneRecord: () => { parts: unknown[]; project: Record<string, unknown> };
  editBodyEvidenceSource: () => void;
}

const studio = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.bodyCalibrations());
let app: App;
const commandCount = () => app.page.evaluate(() => (window as unknown as { __bodyCommands: number }).__bodyCommands);
const historicalTry = `body-analysis-history-${'a'.repeat(100)}`;
let baseline: { parts: unknown[]; project: Record<string, unknown> };

async function expectReadable(selector: string) {
  const violations = await app.page
    .locator(selector)
    .filter({ visible: true })
    .evaluate((root) => {
      const bounds = root.getBoundingClientRect();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      const violations: string[] = [];
      const readings: DOMRect[] = [];
      let node = walker.nextNode();

      while (node) {
        const parent = node.parentElement!;
        const visible = parent.getClientRects().length > 0 && !parent.closest('select, option');

        if (visible && node.textContent?.trim()) {
          range.selectNodeContents(node);

          const rectangles = [...range.getClientRects()];
          const viewport = parent.closest('.overflow-y-auto')?.getBoundingClientRect() ?? bounds;
          const visibleRectangles = rectangles.filter(
            (rect) => rect.top >= viewport.top && rect.bottom <= viewport.bottom,
          );
          const clipped = rectangles.some((rect) => rect.left < bounds.left - 1 || rect.right > bounds.right + 1);
          const overlaps = visibleRectangles.some((rect) =>
            readings.some(
              (before) =>
                rect.left < before.right - 1 &&
                rect.right > before.left + 1 &&
                rect.top < before.bottom - 1 &&
                rect.bottom > before.top + 1,
            ),
          );

          violations.push(...(clipped || overlaps ? [node.textContent] : []));
          readings.push(...visibleRectangles);
        }

        node = walker.nextNode();
      }

      return violations;
    });

  expect(violations).toEqual([]);
}

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

  await app.page.evaluate(
    async ({ run, model, historicalTry }) => {
      const studio = (window as unknown as { __studio: Studio }).__studio;

      await studio.seedBodyEvidence({ run, model, id: historicalTry, analyzed: true });
      await studio.seedBodyEvidence({ run, model, id: 'body-analysis-arm' });
    },
    { run, model, historicalTry },
  );
  baseline = await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord());

  const handle = app.page.locator('[role="separator"][aria-valuemin="230"]').filter({ visible: true });
  const bounds = (await handle.boundingBox())!;

  await app.page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await app.page.mouse.down();
  await app.page.mouse.move(bounds.x + bounds.width / 2 - 58, bounds.y + bounds.height / 2);
  await app.page.mouse.up();
  expect(await handle.getAttribute('aria-valuenow')).toBe('230');
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

      await expectReadable('[data-testid="body-calibration"]');
      await app.page.getByRole('button', { name: 'Analyze Try', exact: true }).filter({ visible: true }).click();
      expect(
        await app.page.getByRole('combobox', { name: 'Try' }).evaluate((element) => document.activeElement === element),
      ).toBe(true);
      expect(await app.page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).count()).toBe(0);
      expect(await app.page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).count()).toBe(1);
      await app.page.getByRole('combobox', { name: 'Try' }).selectOption('body-analysis-arm');
      await app.page.getByRole('button', { name: 'Analyze', exact: true, disabled: false }).press('Enter');
      await app.page.locator('[data-body-parameter="payloadKg"]').waitFor();
      expect(await app.page.locator('[data-testid="body-analysis"]').textContent()).toContain('body-analysis-arm');
      expect(await app.page.locator('[data-distinguishability="distinguishable"]').count()).toBeGreaterThan(0);
      expect(await app.page.locator('[data-distinguishability="coupled"]').count()).toBeGreaterThanOrEqual(2);
      await expectReadable('[role="dialog"][aria-label="Analyze Try"]');
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
      await app.page.keyboard.press('ControlOrMeta+k');
      await app.page.getByPlaceholder('Search commands').fill('Analyze Try');
      await app.page.getByPlaceholder('Search commands').press('Enter');
      await app.page.getByRole('combobox', { name: 'Try' }).selectOption(historicalTry);
      await app.page.locator('[data-testid="body-analysis"][data-applicable="true"]').waitFor();
      await app.page.locator('[data-testid="body-analysis"] summary').press('Enter');
      expect(await app.page.locator('[data-testid="body-analysis"] details').getAttribute('open')).not.toBeNull();
      await expectReadable('[role="dialog"][aria-label="Analyze Try"]');
      await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.editBodyEvidenceSource());
      await app.page.getByText('Out of date', { exact: true }).waitFor();
      expect(await app.page.locator('[data-testid="body-analysis"]').getAttribute('data-applicable')).toBe('false');
      expect(await app.page.locator('[data-body-parameter]').count()).toBeGreaterThan(0);
      expect(await commandCount()).toBe(0);
      await app.page.keyboard.press('Escape');
      expect(await app.page.getByRole('dialog', { name: 'Analyze Try' }).count()).toBe(0);
      expect(app.errors).toEqual([]);
    },
  );

  it(
    'refuses a legacy try without evidence and disables analysis for an empty picker',
    { retry: 0, timeout: 15000 },
    async () => {
      await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
        ...baseline,
        id: 'body-analysis-scene',
        project: { ...baseline.project, bodyEvidence: [] },
      });
      await app.page.getByRole('button', { name: 'Analyze Try', exact: true }).filter({ visible: true }).click();
      await app.page.getByRole('button', { name: 'Analyze', exact: true }).click();
      await app.page.getByText('This try has no matching model evidence.', { exact: true }).waitFor();
      await app.page.keyboard.press('Escape');
      await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
        ...baseline,
        id: 'body-analysis-empty-scene',
      });
      await app.page.getByRole('button', { name: 'Analyze Try', exact: true }).filter({ visible: true }).click();
      expect(await app.page.getByRole('combobox', { name: 'Try' }).locator('option').count()).toBe(0);
      expect(await app.page.getByRole('button', { name: 'Analyze', exact: true }).isDisabled()).toBe(true);
      expect(await commandCount()).toBe(0);
      expect(app.errors).toEqual([]);
    },
  );
});
