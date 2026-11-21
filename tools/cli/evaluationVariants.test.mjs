import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import loadMujoco from '@mujoco/mujoco';
import { afterEach, expect, it } from 'vitest';
import { evaluationFixture, invokeEvaluation } from './evaluationFixture.mjs';
import { decodeSceneFile, encodeSceneFile } from '../../src/utils/sceneFile';
import { stationaryEvaluationPolicy } from '../../src/cases/evaluationPolicy.fixtures';
import { sceneRobot } from '../../src/cases/sceneCheck';
import { runCase } from '../../src/cases/runCase';
import { identity, json } from './evaluationFiles.mjs';
import { freezeEvaluation } from './evaluationFreeze.mjs';
import { runEvaluation } from './evaluationRun.mjs';
import { evaluationContext } from './evaluationContext.fixtures.mjs';

const dirs = [];
const fixture = async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluation-variant-'));

  dirs.push(dir);

  return { ...(await evaluationFixture(dir)), dir };
};
const freeze = (f, options = {}) =>
  freezeEvaluation(
    f.baseline,
    { candidate: f.candidate, package: f.package, seeds: '7', ...options },
    evaluationContext,
  );

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

it('compares a changed retained controller under the same robot, Case, engine and seed', async () => {
  const f = await fixture();
  const mj = await loadMujoco();
  const scene = await decodeSceneFile(fs.readFileSync(f.baseline));
  const policy = stationaryEvaluationPolicy(await sceneRobot(scene, {}), mj.mj_versionString());
  const file = path.join(f.dir, 'policy.json');

  fs.copyFileSync(f.baseline, f.candidate);
  fs.writeFileSync(file, json(policy));
  expect(await freeze(f, { 'candidate-policy': file, conditions: 'fixed' })).toBe(0);
  expect(await runEvaluation(f.package, { output: f.output }, evaluationContext)).toBe(1);

  const report = JSON.parse(fs.readFileSync(path.join(f.output, 'comparison.json')));

  expect(report.changes).toEqual(['controller']);
  expect(report.pairs[0].baseline.passed).toBe(true);
  expect(report.pairs[0].candidate.passed).toBe(false);
});

it('pins the world when candidate geometry changes and records the geometric regression', async () => {
  const f = await fixture();
  const source = await decodeSceneFile(fs.readFileSync(f.baseline));
  const parts = source.parts.map((part, index) =>
    index ? part : { ...part, dimensions: { ...part.dimensions, height: part.dimensions.height * 10 } },
  );

  fs.writeFileSync(f.candidate, await encodeSceneFile({ ...source, parts }));
  expect(await freeze(f, { conditions: 'fixed' })).toBe(0);
  expect(await runEvaluation(f.package, { output: f.output }, evaluationContext)).toBe(1);

  const report = JSON.parse(fs.readFileSync(path.join(f.output, 'comparison.json')));

  expect(report.changes).toContain('geometry');
  expect(report.pairs[0].baseline.passed).toBe(true);
  expect(report.pairs[0].candidate.passed).toBe(false);
});

it('independently reproduces a randomized-world paired outcome with the production runner', async () => {
  const f = await fixture();

  expect(await freeze(f, { conditions: 'randomized' })).toBe(0);
  expect((await invokeEvaluation('run', f.package, '--output', f.output, '--seeds', '99')).code).toBe(2);
  expect(fs.existsSync(f.output)).toBe(false);
  expect(await runEvaluation(f.package, { output: f.output }, evaluationContext)).toBe(1);

  const report = JSON.parse(fs.readFileSync(path.join(f.output, 'comparison.json')));
  const mj = await loadMujoco();
  const result = await runCase(mj, f.kase, await sceneRobot(f.weakScene, {}), {
    controller: 'reference',
    seed: 7,
    fixedCase: true,
  });

  expect(result.passed).toBe(report.pairs[0].candidate.passed);
  expect(result.margin).toBe(report.pairs[0].candidate.margin);
  expect(result.case).toEqual(f.kase);
});

it('refuses missing geometry, corrupt prepared bytes and a mismatched engine before running', async () => {
  const f = await fixture();

  fs.writeFileSync(
    f.candidate,
    await encodeSceneFile({
      ...f.weakScene,
      parts: f.weakScene.parts.map((part, index) =>
        index ? part : { ...part, kind: 'component', componentId: 'missing-evaluation-mesh' },
      ),
    }),
  );
  await expect(freeze(f)).rejects.toThrow('ENOENT');
  expect(fs.existsSync(f.package)).toBe(false);
  fs.copyFileSync(f.baseline, f.candidate);
  expect(await freeze(f)).toBe(0);

  const manifest = path.join(f.package, 'evaluation.json');
  const declaration = JSON.parse(fs.readFileSync(manifest));
  const changed = { ...declaration };

  delete changed.id;

  changed.engine = { ...changed.engine, mujoco: 'different' };
  fs.writeFileSync(manifest, json({ ...changed, id: identity(changed) }));

  const engineOutput = path.join(f.dir, 'engine-refusal');

  expect(await runEvaluation(f.package, { output: engineOutput }, evaluationContext)).toBe(2);
  expect(JSON.parse(fs.readFileSync(path.join(engineOutput, 'comparison.json'))).problem).toBe('engine');

  fs.writeFileSync(manifest, json(declaration));
  fs.writeFileSync(path.join(f.package, 'candidate', 'geometry.json'), 'corrupt');
  await expect(runEvaluation(f.package, { output: f.output }, evaluationContext)).rejects.toThrow(
    'Evaluation file differs:',
  );
  expect(fs.existsSync(f.output)).toBe(false);
});

it('bounds failure retention while completing every declared short trial', async () => {
  const f = await fixture();
  const source = await decodeSceneFile(fs.readFileSync(f.baseline));
  const kase = { ...f.kase, task: { ...f.kase.task, seconds: 1 } };
  const scene = { ...source, project: { ...source.project, cases: [kase] } };
  const bytes = await encodeSceneFile(scene);

  fs.writeFileSync(f.baseline, bytes);
  fs.writeFileSync(f.candidate, bytes);
  expect(await freeze(f, { seeds: Array.from({ length: 16 }, (_, i) => i).join(','), conditions: 'fixed' })).toBe(0);

  const run = await runEvaluation(f.package, { output: f.output }, evaluationContext);
  const report = JSON.parse(fs.readFileSync(path.join(f.output, 'comparison.json')));

  expect(run, JSON.stringify(report)).toBe(0);

  const archives = fs.readdirSync(f.output).filter((name) => name.endsWith('.tries.zip'));

  expect(report.pairs).toHaveLength(16);
  expect(report.status).toBe('complete');
  expect(archives).toHaveLength(8);
  expect(report.metrics.bytes).toBeLessThan(128 * 1024 * 1024);
});
