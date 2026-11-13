import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseBvh } from '../utils/mocap';
import { validateEnvironment } from './environment';
import { squatWaveBvh } from './moveCaseBvh';
import { caseModel, moveCases, type MoveCase } from './moveCases';
import { MOVE_BARS, moveAnalysis, moveEnvironment, moveProblems } from './moveEnvironment';
import { referencePeriodS } from './moveReference';
import { MOVE_LAG_S, moveTube, referenceAt } from './moveTube';
import { judgeRollout } from './rollout';
import { routeTask } from './router';

const cases = moveCases();
const byId = (id: string) => cases.find((c) => c.id === id)!;
const legged = cases.filter((c) => c.expect === 'tracking');
const setUp = (c: MoveCase) => {
  const model = caseModel(c);

  return { model, environment: moveEnvironment(model, c.animation) };
};

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

describe('the move cases', () => {
  it.each(cases.map((c) => [c.id, c] as const))('%s builds a valid move routed as expected', async (_, c) => {
    const { model, environment } = setUp(c);

    expect(await validateEnvironment(environment, model)).toEqual([]);
    expect(moveProblems(model, environment.reference!)).toEqual([]);
    expect(routeTask(moveAnalysis(model)).method).toBe(c.expect);
  });

  it.each(legged.map((c) => [c.id, c] as const))('%s fails its contract when the robot holds still', async (_, c) => {
    const { model, environment } = setUp(c);
    const still = await judgeRollout({ mj, model, environment, controller: { kind: 'hold' }, label: 'still' });

    expect(still.passed).toBe(false);
  });

  it('the humanoid is a floating legged robot with G1 joint names', () => {
    const model = caseModel(byId('humanoid-wave'));
    const robot = model.robots[0];

    expect(robot.morphology).toBe('legged');
    expect(robot.floating).toBe(true);
    expect(robot.joints).toEqual(
      expect.arrayContaining([
        'left_hip_pitch_joint',
        'right_knee_joint',
        'right_shoulder_roll_joint',
        'left_elbow_joint',
      ]),
    );
  });
});

describe('the retargeted squat', () => {
  it('comes from a BVH through the app’s retargeter, legs only', () => {
    const mocap = parseBvh(squatWaveBvh(), 'Squat and wave');
    const squat = byId('biped-squat-mocap').animation;
    const keyed = [...new Set(squat.keyframes.flatMap((k) => Object.keys(k.values)))];

    expect(mocap.bones).toEqual(expect.arrayContaining(['Hips', 'LeftUpLeg', 'RightForeArm']));
    expect(mocap.duration).toBeCloseTo(4, 1);
    expect(squat.source).toBe('mocap');
    expect(keyed).toEqual(expect.arrayContaining(['l_pitch', 'l_bend', 'l_tilt', 'r_pitch', 'r_bend', 'r_tilt']));
  });

  it('falls when the animation is only played back', async () => {
    const c = byId('biped-squat-mocap');
    const { model, environment } = setUp(c);
    const played = await judgeRollout({
      mj,
      model,
      environment,
      controller: { kind: 'animation', animation: c.animation },
      label: 'played',
    });

    expect(played.passed).toBe(false);
    expect(played.failed).toContain('fell');
  });
});

describe('one-shot and source', () => {
  it('a one-shot ends at its last key and holds it', () => {
    const { environment } = setUp(byId('quad-sit'));
    const reference = environment.reference!;
    const last = reference.frames.at(-1)!;
    const settled = referencePeriodS(reference) + MOVE_LAG_S;
    const tube = moveTube(reference, { horizonS: environment.horizonS, toleranceRad: MOVE_BARS.toleranceRad });
    const held = tube.filter((w) => w.from >= settled);

    expect(environment.horizonS - referencePeriodS(reference)).toBeGreaterThanOrEqual(MOVE_BARS.holdS);
    expect(referenceAt(reference, 10_000)).toEqual(last);
    expect(held.length).toBeGreaterThan(0);

    for (const window of held)
      window.bands.forEach(([lo, hi], j) => {
        expect((lo + hi) / 2).toBeCloseTo(last[j], 9);
        expect(hi - lo).toBeCloseTo(2 * MOVE_BARS.toleranceRad, 9);
      });
  });

  it('a hand-keyed and a retargeted move on one robot take the same path', () => {
    const mocap = setUp(byId('biped-squat-mocap'));
    const keyed = setUp(byId('biped-bow'));
    const kinds = (e: typeof mocap.environment) => e.observation.map((o) => o.kind);

    expect(byId('biped-squat-mocap').animation.source).toBe('mocap');
    expect(byId('biped-bow').animation.source).toBe('user');
    expect(routeTask(moveAnalysis(mocap.model)).method).toBe(routeTask(moveAnalysis(keyed.model)).method);
    expect(kinds(mocap.environment)).toEqual(kinds(keyed.environment));
    expect(mocap.environment.action.joints).toEqual(keyed.environment.action.joints);
    expect(mocap.environment.reference!.joints).toEqual(keyed.environment.reference!.joints);
  });
});
