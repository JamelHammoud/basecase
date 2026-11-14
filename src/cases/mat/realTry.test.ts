import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureMeasures, fixtureTriangles, type FixtureRobot } from '../../sim/fixtures/parts';
import { fixtureRobots } from '../../sim/fixtures/robots';
import { buildMjcf } from '../../sim/mjcf';
import { DEFAULT_PROJECT } from '../../types/robotics';
import { buildRig } from '../../utils/kinematics';
import { buildCase, builderRobot, type CaseSpec } from '../caseBuilder';
import { stageCase } from '../caseCast';
import { worldItem, type Case } from '../schema';
import { runCase } from '../testing';
import { scoreTry } from '../tries';
import { caseMat, type CaseMat } from './matLayout';
import { matCamera, realSamples, shoot, simTagFixes, tagFix } from './matTesting';
import { basePathOf, realRecording } from './realTry';
import * as THREE from 'three';

const SIM_MS = 120_000;

const fixture = (id: string) => fixtureRobots().find((r) => r.id === id)!;

function made(robot: FixtureRobot, spec: CaseSpec): Case {
  const built = buildCase(spec, builderRobot(buildRig(robot.joints, robot.parts), robot.parts));

  if (!built.ok) throw new Error(built.problem);

  return built.kase;
}

async function simRunOf(robot: FixtureRobot, controller: 'reference' | 'limp') {
  const mj = await loadMujoco();
  const rig = buildRig(robot.joints, robot.parts);
  const kase = made(robot, { goal: 'reach', world: 'floor' });
  const run = await runCase(mj, kase, robot, { controller, record: true });
  const mat = caseMat(run.case, { rig, parts: robot.parts }, 'a4')!;

  return { run, rig, mat, scene: { model: run.model, rig } };
}

type Run = Awaited<ReturnType<typeof simRunOf>>;

const runs = new Map<string, Promise<Run>>();

const simRun = (robot: FixtureRobot, controller: 'reference' | 'limp') => {
  const key = `${robot.id}-${controller}`;

  if (!runs.has(key)) runs.set(key, simRunOf(robot, controller));

  return runs.get(key)!;
};

async function realTry({ run, rig, mat, scene }: Run, hide?: [number, number]) {
  const fixes = simTagFixes(run.recording!, scene, mat.base);
  const seconds = run.case.task.seconds;
  const hidden = (t: number) => !!hide && t >= hide[0] && t < hide[1];
  const shot = await shoot({ mat, camera: matCamera(mat), seconds, pose: (t) => (hidden(t) ? null : fixes(t)) });
  const recording = realRecording({ samples: realSamples(shot.samples), seconds }, { ...scene, base: mat.base });
  const verdict = await scoreTry({ kase: run.case, model: run.model, recording, rig, effector: null });

  return { recording, verdict, shot };
}

const distance = (a: [number, number] | null, b: [number, number] | null) =>
  a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0;

describe('a real try on a printed mat', () => {
  it(
    'tracks the rover’s Reach a Spot within 10 mm of the sim’s path, and passes',
    async () => {
      const sim = await simRun(fixture('rover-diff'), 'reference');
      const { verdict, shot } = await realTry(sim);
      const truth = simTagFixes(sim.run.recording!, sim.scene, sim.mat.base);
      const off = shot.samples.map((s) => (s.base ? distance([s.base.x, s.base.z], [truth(s.t).x, truth(s.t).z]) : 0));

      expect(sim.run.passed).toBe(true);
      expect(shot.samples.every((s) => s.base)).toBe(true);
      expect(Math.max(...off)).toBeLessThan(10);
      expect(verdict.passed).toBe(true);
    },
    SIM_MS,
  );

  it(
    'misses on a stalled rover run',
    async () => {
      const sim = await simRun(fixture('rover-diff'), 'limp');
      const { recording, verdict } = await realTry(sim);

      expect(basePathOf(recording, sim.scene).filter(Boolean).length).toBeGreaterThan(recording.frames * 0.9);
      expect(verdict.passed).toBe(false);
    },
    SIM_MS,
  );

  it(
    'leaves a gap where the base tag was hidden for 1 s, and still judges the try',
    async () => {
      const sim = await simRun(fixture('rover-diff'), 'reference');
      const { recording, verdict } = await realTry(sim, [1, 2]);
      const path = basePathOf(recording, sim.scene);
      const gap = path.filter((p, i) => !p && i * recording.dt > 0.9 && i * recording.dt < 2.1).length;

      expect(gap).toBeGreaterThanOrEqual(45);
      expect(verdict.passed).toBe(true);
    },
    SIM_MS,
  );
});

function quadPath(mat: CaseMat, seconds: number) {
  const pivot = mat.path[0];
  const legs = mat.path.slice(1).map((to, i) => ({ from: mat.path[i], to }));
  const share = 0.85 / legs.length;

  return (t: number) => {
    const k = Math.min(legs.length - 1e-9, t / seconds / share);
    const leg = legs[Math.floor(k)];
    const walk = Math.min(1, (k % 1) * 1.4);
    const sway = Math.sin(t * 2 * Math.PI * 2) * 8;
    const x = leg.from[0] + (leg.to[0] - leg.from[0]) * walk + sway;
    const z = leg.from[1] + (leg.to[1] - leg.from[1]) * walk;
    const wobble = Math.sin(t * 2 * Math.PI * 2 + 1) * 0.04;
    const delta = new THREE.Matrix4()
      .makeTranslation(x, 0, z)
      .multiply(new THREE.Matrix4().makeRotationY(wobble))
      .multiply(new THREE.Matrix4().makeTranslation(-pivot[0], 0, -pivot[1]));

    return { fix: tagFix(mat.base, delta), at: [x, z] as [number, number] };
  };
}

describe('a quadruped on a printed mat', () => {
  it('passes Follow a Path within tolerance', async () => {
    const robot = fixture('quad-servo');
    const rig = buildRig(robot.joints, robot.parts);
    const staged = stageCase(made(robot, { goal: 'path', world: 'floor' }), { rig, parts: robot.parts }, []).kase;
    const model = buildMjcf({
      parts: robot.parts,
      rig,
      project: DEFAULT_PROJECT,
      measures: fixtureMeasures(robot.parts),
      partTriangles: fixtureTriangles(robot.parts),
      world: staged.world.objects.map(worldItem),
    });
    const mat = caseMat(staged, { rig, parts: robot.parts }, 'a4')!;
    const seconds = staged.task.seconds;
    const walk = quadPath(mat, seconds);
    const shot = await shoot({ mat, camera: matCamera(mat), seconds, pose: (t) => walk(t).fix });
    const recording = realRecording({ samples: realSamples(shot.samples), seconds }, { model, rig, base: mat.base });
    const real = basePathOf(recording, { model, rig });
    const truth = real.map((_, i) => walk(i * recording.dt).at);
    const verdict = await scoreTry({ kase: staged, model, recording, rig, effector: null });

    expect(Math.max(...real.map((p, i) => distance(p, truth[i])))).toBeLessThan(15);
    expect(verdict.passed).toBe(true);
  }, 60_000);
});
