import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureMeasures, fixtureTriangles, type FixtureRobot } from '../sim/fixtures/parts';
import { fixtureRobots } from '../sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildBom } from '../utils/bom';
import { runEngineering } from '../utils/engineering';
import { betterOf, comparableRobots, compareCase, type CompareRobot } from './caseCompare';
import { CASE_RUNS, runCaseTimes, type CaseRuns } from './caseRuns';
import { presetCase } from './testing';

const fixture = (id: string) => fixtureRobots().find((r) => r.id === id)!;

const withWheelEffort = (robot: FixtureRobot, effortNm: number): FixtureRobot => ({
  ...robot,
  joints: robot.joints.map((j) => ({ ...j, effortNm })),
});

const compareRobot = (tabId: string, robot: FixtureRobot): CompareRobot => ({
  tabId,
  name: tabId,
  parts: robot.parts,
  project: { ...DEFAULT_PROJECT, joints: robot.joints },
  measures: fixtureMeasures(robot.parts),
  partTriangles: fixtureTriangles(robot.parts),
});

const SMALL_GEAR_MOTOR_NM = 0.25;
const RUNS = CASE_RUNS;
const SIM_MS = 60_000;

const rover = withWheelEffort(fixture('rover-diff'), SMALL_GEAR_MOTOR_NM);
const weak = withWheelEffort(rover, SMALL_GEAR_MOTOR_NM * 0.3);
const flag = presetCase(rover, 'reach-the-flag');

const runs = (passes: number): CaseRuns => ({
  runs: 20,
  passes,
  medianMargin: 0,
  commonFailure: null,
  failures: [],
  worstSeed: null,
  refusal: null,
});

describe('comparing two robots on one Case', () => {
  it(
    'runs the same seeds on both, and marks the rover with full wheel motors better',
    async () => {
      const mj = await loadMujoco();
      const seen: string[] = [];
      const comparison = await compareCase(flag, [compareRobot('weak', weak), compareRobot('strong', rover)], {
        purchases: {},
        runs: (robot) => {
          seen.push(robot.tabId);

          return runCaseTimes(
            mj,
            flag,
            { id: robot.tabId, joints: robot.project.joints ?? [], ...robot },
            { runs: RUNS },
          );
        },
      });
      const [weakRow, strongRow] = comparison.robots;

      expect(seen.sort()).toEqual(['strong', 'weak']);
      expect(strongRow.runs.runs).toBe(RUNS);
      expect(weakRow.runs.runs).toBe(RUNS);
      expect(strongRow.runs.passes).toBeGreaterThan(weakRow.runs.passes);
      expect(comparison.better).toBe('strong');
    },
    SIM_MS,
  );

  it('never lists a robot that does not fit the Case', () => {
    const arm = fixture('arm-3dof');
    const listed = comparableRobots(flag, [
      { name: 'Arm', ...arm },
      { name: 'Rover', ...rover },
    ]);

    expect(listed.map((r) => r.name)).toEqual(['Rover']);
  });

  it('takes cost from the bill of materials and mass from the Weight check', async () => {
    const robot = compareRobot('rover', rover);
    const comparison = await compareCase(flag, [robot], { purchases: {}, runs: async () => runs(20) });
    const { parts, project, measures } = robot;

    expect(comparison.robots[0].costUsd).toBe(
      buildBom({ parts, project, purchases: {}, measures }).totals.estimatedUsd,
    );
    expect(comparison.robots[0].massG).toBe(runEngineering({ parts, project, measures, servoOutputs: {} }).massG);
    expect(comparison.robots[0].massG).toBeGreaterThan(0);
  });

  it('marks nothing better on a tie, and counts a refusal as no passes', () => {
    const row = (tabId: string, r: CaseRuns) => ({ tabId, name: tabId, runs: r, costUsd: 0, massG: 0 });

    expect(betterOf([row('a', runs(12)), row('b', runs(12))])).toBeNull();
    expect(betterOf([row('a', runs(3)), row('b', { ...runs(0), refusal: 'No wheels.' })])).toBe('a');
  });
});
