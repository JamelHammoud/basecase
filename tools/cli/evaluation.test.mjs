import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { evaluationFixture, invokeEvaluation } from './evaluationFixture.mjs';
import { decodeTryArchive } from '../../src/cases/tryArchiveJobs';
import { runCase } from '../../src/cases/runCase';
import loadMujoco from '@mujoco/mujoco';
import * as sceneFile from '../../src/utils/sceneFile';
import * as sceneCheck from '../../src/cases/sceneCheck';
import { freezeEvaluation } from './evaluationFreeze.mjs';
import { runEvaluation } from './evaluationRun.mjs';
import { evaluationContext as context } from './evaluationContext.fixtures.mjs';

const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

it('compares paired rover revisions, independently reproduces the failure and inspects it through the CLI', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluation-'));

  dirs.push(dir);

  const fixture = await evaluationFixture(dir);
  const frozen = await freezeEvaluation(
    fixture.baseline,
    { candidate: fixture.candidate, package: fixture.package, seeds: '7,3', conditions: 'fixed' },
    context,
  );

  expect(frozen).toBe(0);

  const ran = await runEvaluation(fixture.package, { output: fixture.output }, context);
  const report = JSON.parse(fs.readFileSync(path.join(fixture.output, 'comparison.json'), 'utf8'));

  expect(ran).toBe(1);
  expect(report.status).toBe('complete');
  expect(report.pairs.map((pair) => pair.seed)).toEqual([7, 3]);
  expect(report.pairs.every((pair) => pair.baseline.passed && !pair.candidate.passed)).toBe(true);
  expect(report.regressions).toBe(2);
  expect(report.changes).toContain('robot');
  expect(fs.readFileSync(path.join(fixture.output, 'report.html'), 'utf8')).toContain('Missed');

  const pair = report.pairs[0];
  const archive = decodeTryArchive(fs.readFileSync(path.join(fixture.output, pair.candidate.recording)));

  expect(archive[0].stored.robot.modelHash).toBe(pair.candidate.model);
  expect(archive[0].stored.seed).toBe(7);
  expect(archive[0].stored.outcome.verdict).toBe('failed');

  const mj = await loadMujoco();
  const result = await runCase(mj, fixture.kase, await sceneCheck.sceneRobot(fixture.weakScene, {}), {
    controller: 'reference',
    fixedCase: true,
    worldRandomization: false,
    seed: 7,
  });

  expect(result.passed).toBe(pair.candidate.passed);
  expect(result.margin).toBe(pair.candidate.margin);
  expect(result.failed.length ? result.failed : ['Missed']).toEqual(pair.candidate.failed);
  expect((await invokeEvaluation('inspect', fixture.output)).code).toBe(1);
});

it('refuses duplicate seeds during preparation and changed Case contracts through the CLI', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluation-'));

  dirs.push(dir);

  const fixture = await evaluationFixture(dir);

  await expect(
    freezeEvaluation(
      fixture.baseline,
      { candidate: fixture.candidate, package: fixture.package, seeds: '1,1' },
      context,
    ),
  ).rejects.toThrow('Choose 1 to 32 distinct unsigned seeds.');
  expect(fs.existsSync(fixture.package)).toBe(false);

  const changed = { ...fixture.kase, task: { ...fixture.kase.task, seconds: fixture.kase.task.seconds + 1 } };

  fs.writeFileSync(
    fixture.candidate,
    await sceneFile.encodeSceneFile({
      ...fixture.weakScene,
      project: { ...fixture.weakScene.project, cases: [changed] },
    }),
  );

  const refused = await invokeEvaluation(
    'freeze',
    fixture.baseline,
    '--candidate',
    fixture.candidate,
    '--package',
    fixture.package,
  );

  expect(refused.code).toBe(2);
  expect(refused.stderr).toContain('Case declarations differ.');
  expect(fs.existsSync(fixture.package)).toBe(false);
});
