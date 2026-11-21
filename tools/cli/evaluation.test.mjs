import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { evaluationFixture, invokeEvaluation } from './evaluationFixture.mjs';
import { decodeTryArchive } from '../../src/cases/tryArchiveJobs';
import { runCase } from '../../src/cases/runCase';
import { sceneRobot } from '../../src/cases/sceneCheck';
import loadMujoco from '@mujoco/mujoco';
import { encodeSceneFile } from '../../src/utils/sceneFile';

const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

it('freezes and runs paired rover revisions through the CLI and independently reproduces the failure', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluation-'));

  dirs.push(dir);

  const fixture = await evaluationFixture(dir);
  const frozen = await invokeEvaluation(
    'freeze',
    fixture.baseline,
    '--candidate',
    fixture.candidate,
    '--package',
    fixture.package,
    '--seeds',
    '7,3',
    '--conditions',
    'fixed',
  );

  expect(frozen.code).toBe(0);

  const ran = await invokeEvaluation('run', fixture.package, '--output', fixture.output);
  const report = JSON.parse(fs.readFileSync(path.join(fixture.output, 'comparison.json'), 'utf8'));

  expect(ran.code).toBe(1);
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
  const result = await runCase(mj, fixture.kase, await sceneRobot(fixture.weakScene, {}), {
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

it('refuses duplicate seeds and changed Case contracts before freezing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluation-'));

  dirs.push(dir);

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
        '1,1',
      )
    ).code,
  ).toBe(2);
  expect(fs.existsSync(fixture.package)).toBe(false);

  const changed = { ...fixture.kase, task: { ...fixture.kase.task, seconds: fixture.kase.task.seconds + 1 } };

  fs.writeFileSync(
    fixture.candidate,
    await encodeSceneFile({ ...fixture.weakScene, project: { ...fixture.weakScene.project, cases: [changed] } }),
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
