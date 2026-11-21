import fs from 'node:fs';
import loadMujoco from '@mujoco/mujoco';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { DEFAULT_PROJECT } from '../types/robotics';
import { CASE_RANDOMIZATION } from './caseRandom';
import { stationaryEvaluationPolicy } from './evaluationPolicy.fixtures';
import { evaluationController } from './evaluationController';
import { evaluationRunner } from './evaluationExecution';
import { evaluationWorkflow, EVALUATION_WORKFLOWS } from './evaluationMatrix.fixtures';
import { caseRunner } from './runCase';
import { evaluationReplay } from './evaluationReplay';
import { encodeRecording, decodeRecording } from './recordingFile';

const observations: unknown[] = [];

afterAll(() => {
  fs.mkdirSync('scratch', { recursive: true });
  fs.writeFileSync('scratch/evaluation-workflows.json', JSON.stringify(observations, null, 2));
});

let mj: Awaited<ReturnType<typeof loadMujoco>>;

beforeAll(async () => {
  mj = await loadMujoco();
});

it.each(EVALUATION_WORKFLOWS)(
  'reproduces %s against immutable Case conditions, with explicit unsupported reference refusals',
  async (name) => {
    const { robot, kase } = evaluationWorkflow(name);
    const scene = {
      name,
      globalGoal: '',
      parts: robot.parts,
      annotations: [],
      project: { ...DEFAULT_PROJECT, joints: robot.joints, cases: [kase] },
    };
    const policy = name === 'biped balance' ? stationaryEvaluationPolicy(robot, mj.mj_versionString()) : undefined;
    const revision = { robot, scene, controller: evaluationController(policy) };
    const independent = () =>
      caseRunner(mj, kase, robot, {
        controller: policy ? 'policy' : 'reference',
        policy,
        project: scene.project,
        fixedCase: true,
        worldRandomization: false,
        randomization: CASE_RANDOMIZATION,
        record: true,
      });
    const expected = independent();

    if (expected.refusal || expected.controller === 'limp') {
      expect(name).toBe('closed-linkage motion');
      observations.push({ name, unsupported: expected.refusal ?? expected.controller });
      console.info(
        'evaluation-workflow',
        JSON.stringify({ name, unsupported: expected.refusal ?? expected.controller }),
      );
      expect(() =>
        evaluationRunner(mj, kase, revision, { conditions: 'fixed', randomization: CASE_RANDOMIZATION }),
      ).toThrow('Unsupported model:');

      return;
    }

    expect(name).not.toBe('closed-linkage motion');

    const runner = evaluationRunner(mj, kase, revision, { conditions: 'fixed', randomization: CASE_RANDOMIZATION });
    const baseline = await runner.run(7);
    const unchanged = await runner.run(7);
    const reproduced = await independent().run(7);

    if (name === 'hexapod traversal') expect(baseline.passed).toBe(true);

    console.info(
      'evaluation-workflow',
      JSON.stringify({
        name,
        passed: baseline.passed,
        margin: baseline.margin,
        failed: baseline.failed,
        frames: baseline.frames.length,
      }),
    );
    observations.push({
      name,
      passed: baseline.passed,
      margin: baseline.margin,
      failed: baseline.failed,
      frames: baseline.frames.length,
    });
    expect(unchanged.passed).toBe(baseline.passed);
    expect(unchanged.margin).toBe(baseline.margin);
    expect(unchanged.finalQpos).toEqual(baseline.finalQpos);
    expect(reproduced.failed).toEqual(baseline.failed);
    expect(reproduced.margin).toBe(baseline.margin);
    expect(reproduced.case).toEqual(kase);
    expect(reproduced.recording!.poses).toEqual(baseline.recording!.poses);

    const source = await evaluationReplay(mj, baseline, {
      scene,
      meshes: {},
      evaluation: 'a'.repeat(64),
      revision: 'b'.repeat(64),
      seed: 7,
      randomization: CASE_RANDOMIZATION,
    });
    const portable = decodeRecording(encodeRecording({ ...baseline.recording!, evaluation: source }));

    expect(portable?.evaluation?.model).toEqual(baseline.model);
    expect(portable?.evaluation?.kase).toEqual(baseline.case);
    expect(portable?.evaluation?.passed).toBe(baseline.passed);
    expect(portable?.evaluation?.margin).toBe(baseline.margin);
  },
);
