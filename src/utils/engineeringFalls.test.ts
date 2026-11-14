import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { fallsSim } from '../agent/agentFalls';
import { SimEngine } from '../sim/engine';
import { FALL_WINDOW_S, runFalls } from '../sim/fallRuns';
import { FALL_BIPED_KNEES, FALL_BIPED_POSE, fallBiped } from '../sim/fixtures/fallBiped';
import { fixtureMeasures, fixtureTriangles, type FixtureRobot } from '../sim/fixtures/parts';
import { buildMjcf } from '../sim/mjcf';
import { fixtureRobot } from '../skills/fixtureModels';
import { DEFAULT_PROJECT, type RobotPoseState } from '../types/robotics';
import { runEngineering } from './engineering';
import { aroundTouch, FALLS, fallDirection, fallPeakNm, fallsRow, FALLS_UNMEASURED, NO_LEGS } from './engineeringFalls';
import type { CheckRow, FallSim } from './engineeringTypes';
import { buildRig } from './kinematics';
import { percentile, TorqueRecorder } from './peakTorque';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

const projectOf = (robot: FixtureRobot, pose?: RobotPoseState) => ({
  ...DEFAULT_PROJECT,
  joints: robot.joints,
  ...(pose ? { pose } : {}),
});

function engineering(robot: FixtureRobot, pose?: RobotPoseState, falls?: FallSim | string) {
  return runEngineering({
    parts: robot.parts,
    project: projectOf(robot, pose),
    measures: fixtureMeasures(robot.parts),
    servoOutputs: {},
    falls,
  });
}

const nodeSim = (robot: FixtureRobot, pose?: RobotPoseState) => ({
  falls: async (plan: Parameters<Parameters<typeof fallsSim>[0]['sim']['falls']>[0]) => {
    const model = buildMjcf({
      parts: robot.parts,
      rig: buildRig(robot.joints, robot.parts),
      project: projectOf(robot, pose),
      measures: fixtureMeasures(robot.parts),
      partTriangles: fixtureTriangles(robot.parts),
      pose,
    });
    const engine = new SimEngine(mj, model);
    const robotKey = model.robots.find((r) => r.floating)?.key ?? model.robots[0].key;

    try {
      return { model, runs: runFalls(mj, engine, plan(model, robotKey)) };
    } finally {
      engine.dispose();
    }
  },
});

async function fallsOf(robot: FixtureRobot, pose?: RobotPoseState) {
  const falls = await fallsSim({ sim: nodeSim(robot, pose) }, engineering(robot, pose).joints);

  return { falls, row: engineering(robot, pose, falls).rows.find((r) => r.check === FALLS) };
}

const multipleOf = (row: CheckRow | undefined, label: RegExp) => {
  const item = row?.items?.find((i) => label.test(i.text)) ?? { text: row?.detail ?? '' };

  return Number(/(\d+\.\d)× rated/.exec(item.text)?.[1]);
};

describe('Falls', () => {
  it('fails the long-legged STS3215 biped at the knee, in its worst direction, selecting the knee’s link', async () => {
    const started = performance.now();
    const { row } = await fallsOf(fallBiped(), FALL_BIPED_POSE);

    expect(performance.now() - started).toBeLessThan(15000);
    expect(row?.status).toBe('fail');
    expect(row?.items?.[0].text).toMatch(/^(Left|Right) knee: \d+\.\d× rated, falling (backward|forward)/);
    expect(FALL_BIPED_KNEES).toContain(row?.items?.[0].joint);

    const knee = fallBiped().joints.find((j) => j.id === row?.items?.[0].joint)!;

    expect(row?.items?.[0].ids).toEqual(knee.child);
    expect(row?.items?.[0].fix).toMatchObject({ kind: 'replay-fall' });
  }, 60000);

  it('lowers the knee’s multiple when the knees move to the 1:191 STS3215', async () => {
    const weak = (await fallsOf(fallBiped(), FALL_BIPED_POSE)).row;
    const strong = (await fallsOf(fallBiped('c044'), FALL_BIPED_POSE)).row;
    const kneeOf = (row: CheckRow | undefined) =>
      Math.max(...['Left', 'Right'].map((side) => multipleOf(row, new RegExp(`^${side} knee`)) || 0));

    expect(kneeOf(strong)).toBeLessThan(kneeOf(weak));
  }, 60000);

  it('passes or warns the servo quad, naming each flagged joint', async () => {
    const { row } = await fallsOf(fixtureRobot('quad-servo'));

    expect(['pass', 'warn']).toContain(row?.status);

    for (const item of row?.items ?? []) expect(item.text).toMatch(/^Leg\d.*: \d+\.\d× rated, falling \w/i);
  }, 60000);

  it('passes the hexapod', async () => {
    expect((await fallsOf(fixtureRobot('hexapod'))).row?.status).toBe('pass');
  }, 60000);

  it('reads Not run on a low rover and an arm', async () => {
    for (const id of ['rover-diff', 'arm-3dof']) {
      const { falls, row } = await fallsOf(fixtureRobot(id));

      expect(falls).toBe(NO_LEGS);
      expect(row).toMatchObject({ status: 'not run', detail: NO_LEGS });
    }
  }, 60000);

  it('repeats for the same model', async () => {
    const first = await fallsOf(fallBiped(), FALL_BIPED_POSE);
    const again = await fallsOf(fallBiped(), FALL_BIPED_POSE);

    expect(again.falls).toEqual(first.falls);
  }, 60000);

  it('reads Not run on a legged robot until it’s measured, and leaves robots without legs out', () => {
    expect(fallsRow(engineering(fallBiped()).joints, undefined)).toEqual([
      { check: FALLS, status: 'not run', detail: FALLS_UNMEASURED },
    ]);
    expect(fallsRow(engineering(fixtureRobot('arm-3dof')).joints, undefined)).toEqual([]);
  });
});

describe('Falls maths', () => {
  it('takes the 99th percentile of 10 ms windows from the Peak recorder within 0.3 s of first contact', () => {
    const dt = 0.002;
    const recorder = new TorqueRecorder(1, dt, { windowS: FALL_WINDOW_S });

    for (let i = 0; i < 1000; i++) recorder.add([i * dt < 1 ? 0.1 : 0.1 + i * 0.001], [0]);

    const series = recorder.series();
    const touchS = 1;
    const windows = series.absDemand[0];

    expect(series.windowS).toBeCloseTo(0.01, 9);
    expect(aroundTouch(windows, series.windowS, touchS)).toEqual(windows.slice(70, 130));
    expect(fallPeakNm(windows, series.windowS, touchS)).toBe(percentile(windows.slice(70, 130), 0.99));
  });

  it('names twelve directions by the nearest of eight, from forward toward the left', () => {
    expect([0, 30, 90, 150, 180, 240, 270, 330].map(fallDirection)).toEqual([
      'forward',
      'forward and left',
      'left',
      'backward and left',
      'backward',
      'backward and right',
      'right',
      'forward and right',
    ]);
  });
});
