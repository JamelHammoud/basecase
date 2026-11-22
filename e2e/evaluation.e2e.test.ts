import { retainSelfContactSceneFiles } from './selfContactScene';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { evaluationFixture, invokeEvaluation } from '../tools/cli/evaluationFixture.mjs';
import { openApp, shown } from './harness';
import { call, openSaved } from './continuation.helpers';
import type { StoredTry } from '../src/cases/tryFile';
import { evaluationReportLayout, evaluationTimelineLayout } from './evaluationLayout';

it(
  'imports an actual CLI failure and opens its frozen identity and failure in the ordinary timeline',
  { retry: 0 },
  async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluation-browser-'));
    const app = await openApp();

    await retainSelfContactSceneFiles(app.page);

    try {
      const fixture = await evaluationFixture(dir);

      expect(
        (
          await invokeEvaluation(
            'freeze',
            fixture.baseline,
            '--candidate',
            fixture.candidate,
            '--package',
            fixture.package,
            '--seeds',
            '7',
            '--conditions',
            'fixed',
          )
        ).code,
      ).toBe(0);
      expect((await invokeEvaluation('run', fixture.package, '--output', fixture.output)).code).toBe(1);

      const report = JSON.parse(fs.readFileSync(path.join(fixture.output, 'comparison.json'), 'utf8'));
      const trial = report.pairs[0].candidate;
      const archive = fs.readFileSync(path.join(fixture.output, trial.recording));

      await evaluationReportLayout(app.page, fs.readFileSync(path.join(fixture.output, 'report.html'), 'utf8'));

      const chooser = app.page.waitForEvent('filechooser');

      await app.page.keyboard.press('ControlOrMeta+k');
      await app.page.getByLabel('Search commands').fill('Import');
      await app.page
        .locator(shown('button[data-idx]'))
        .filter({ hasText: /^Import$/ })
        .click();
      await (await chooser).setFiles({ name: trial.recording, mimeType: 'application/zip', buffer: archive });
      await app.page.getByRole('tab', { name: 'Rover', exact: true }).click();
      await expect.poll(() => call<Array<{ id: string }>>(app.page, 'tries-list')).toHaveLength(1);

      const stored = (
        await call<StoredTry[]>(app.page, 'tries-manifests', [path.basename(trial.recording, '.tries.zip')])
      )[0];

      expect(stored.robot.name).toBe(trial.revision);
      expect(stored.robot.modelHash).toBe(trial.model);
      expect(stored.seed).toBe(7);
      expect(stored.outcome.verdict).toBe('failed');
      await openSaved(app, stored.id);
      await expect.poll(() => app.page.locator(shown('[data-testid="try-timeline"]')).innerText()).toContain('Missed');
      await evaluationTimelineLayout(app.page);
      expect(stored.sceneId).toBe(report.evaluation);
      await app.page
        .locator(shown('button'))
        .filter({ hasText: /^Done$/ })
        .first()
        .click();
      await app.page.keyboard.press('ControlOrMeta+k');
      await app.page.getByLabel('Search commands').fill('New Scene');
      await app.page
        .locator(shown('button[data-idx]'))
        .filter({ hasText: /^New Scene/ })
        .click();
      await app.page.getByRole('tab', { name: /^Untitled/, selected: true }).waitFor();
      await expect
        .poll(() =>
          app.page.evaluate(
            () =>
              (window as unknown as { __studio: { sceneRecord: () => { parts: unknown[] } } }).__studio.sceneRecord()
                .parts,
          ),
        )
        .toHaveLength(0);
      await openSaved(app, stored.id);
      await expect.poll(() => app.page.locator(shown('[data-testid="try-timeline"]')).innerText()).toContain('Missed');
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);
