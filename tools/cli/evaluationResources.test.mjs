import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { evaluationFixture } from './evaluationFixture.mjs';
import { runEvaluation } from './evaluationRun.mjs';
import { freezeEvaluation } from './evaluationFreeze.mjs';
import { evaluationContext } from './evaluationContext.fixtures.mjs';
import { evaluationPreparations } from '../../src/cases/evaluation';
import { decodeSceneFile } from '../../src/utils/sceneFile';
import { checkCase, sceneRobot } from '../../src/cases/sceneCheck';

it('reuses frozen geometry and matches nominal outcomes from ordinary scene checks', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluation-resources-'));

  try {
    const fixture = await evaluationFixture(dir);
    const before = evaluationPreparations();

    expect(
      await freezeEvaluation(
        fixture.baseline,
        {
          candidate: fixture.candidate,
          package: fixture.package,
          seeds: '7,3',
          conditions: 'fixed',
          randomization: 'nominal',
        },
        evaluationContext,
      ),
    ).toBe(0);
    expect(evaluationPreparations() - before).toBe(2);
    expect(await runEvaluation(fixture.package, { output: fixture.output }, evaluationContext)).toBe(1);
    expect(evaluationPreparations() - before).toBe(2);

    const report = JSON.parse(fs.readFileSync(path.join(fixture.output, 'comparison.json'), 'utf8'));
    const mj = await loadMujoco();

    for (const name of ['baseline', 'candidate']) {
      const scene = await decodeSceneFile(fs.readFileSync(fixture[name]));
      const result = await checkCase(mj, fixture.kase, await sceneRobot(scene, {}));

      expect(report.pairs.map((pair) => pair.seed)).toEqual([7, 3]);

      for (const pair of report.pairs) {
        expect(pair[name].margin).toBe(result.margin);
        expect(pair[name].passed).toBe(result.passes === 1);
      }
    }

    expect(report.metrics.geometryPreparations).toBe(0);
    expect(report.metrics.peakRss).toBeGreaterThan(0);
    expect(report.metrics.bytes).toBeLessThan(128 * 1024 * 1024);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
