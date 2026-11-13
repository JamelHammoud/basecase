import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureMeasures, fixtureTriangles } from '../sim/fixtures/parts';
import { servoArm } from '../sim/fixtures/servoArm';
import { DEFAULT_PROJECT, type ProjectSettings } from '../types/robotics';
import { buildBom } from '../utils/bom';
import { robotWeight } from '../utils/engineering';
import { noRuns, runCaseTimes } from './caseRuns';
import {
  designLabel,
  designScene,
  exploreCase,
  exploreDesigns,
  exploreSpace,
  EXPLORE_RUNS,
  MAX_DESIGNS,
  sameDesign,
  sceneDesign,
  supplyVolts,
  type ExploreBase,
  type ExploreRobot,
} from './explore';
import { touchTheDots } from './testing';

const SIM_MS = 60_000;

const arm = servoArm();
const project: ProjectSettings = { ...DEFAULT_PROJECT, joints: arm.joints };
const base: ExploreBase = {
  parts: arm.parts,
  project,
  measures: fixtureMeasures(arm.parts),
  partTriangles: fixtureTriangles(arm.parts),
};
const space = exploreSpace(arm.parts, project)!;

const robotOf = (robot: ExploreRobot) => ({
  id: 'scene',
  parts: robot.parts,
  joints: robot.project.joints ?? [],
  measures: robot.measures,
  partTriangles: robot.partTriangles,
  servoVolts: robot.servoVolts,
});

describe('the design space', () => {
  it('groups each joint’s servo and starts from the design as built, at its supply', () => {
    expect(space.groups.map((g) => [g.name, g.current])).toEqual([
      ['Shoulder', 'c001'],
      ['Elbow', 'c044'],
      ['Wrist', 'c044'],
    ]);
    expect(space.current.volts).toBeCloseTo(7.4);
    expect(space.volts).toEqual([7.4, 12]);
  });

  it('enumerates at most 64 designs that suit their supply, the current first, the same every time', () => {
    const designs = exploreDesigns(space);
    const keys = designs.map((d) => `${d.volts}|${d.variants}`);

    expect(designs).toHaveLength(MAX_DESIGNS);
    expect(sameDesign(designs[0], space.current)).toBe(true);
    expect(new Set(keys).size).toBe(designs.length);
    expect(exploreDesigns(exploreSpace(arm.parts, project)!)).toEqual(designs);
    expect(designs.map((d) => designLabel(space, d))).toContain('All C018; 12 V');
    expect(designs.some((d) => d.volts === 12 && d.variants.includes('c001'))).toBe(false);
    expect(exploreDesigns(space, 5)).toEqual(designs.slice(0, 5));
  });

  it('swaps the servos’ versions and sets the supply, and reads the scene’s design back', () => {
    const design = { variants: ['c018', 'c018', 'c018'], volts: 12 };
    const scene = designScene(base, space, design);

    expect(scene.parts.filter((p) => p.componentVariant).map((p) => p.componentVariant)).toEqual([
      'c018',
      'c018',
      'c018',
    ]);
    expect(supplyVolts(scene.parts, scene.project)).toBe(12);
    expect(sameDesign(sceneDesign(space, scene), design)).toBe(true);

    const lower = designScene(base, space, { ...design, volts: space.current.volts });

    expect(lower.project.tether?.volts).toBeCloseTo(space.current.volts);
    expect(designScene(base, space, space.current)).toEqual({ parts: base.parts, project });
  });

  it('has no space without a catalog servo that comes in versions', () => {
    const plain = arm.parts.map((p) => ({ ...p, componentId: undefined, componentVariant: undefined }));

    expect(exploreSpace(plain, project)).toBeNull();
  });
});

describe('exploring a Case', () => {
  it(
    'passes the arm as built on Touch the Dots, and a C046 shoulder passes fewer runs',
    async () => {
      const mj = await loadMujoco();
      const kase = touchTheDots(arm);
      const shoulderDown = { variants: ['c046', 'c044', 'c044'], volts: space.current.volts };
      const rows = await exploreCase(base, {
        designs: [space.current, shoulderDown],
        purchases: {},
        runs: (robot) => runCaseTimes(mj, kase, robotOf(robot), { runs: EXPLORE_RUNS }),
      });
      const [built, weaker] = rows;

      expect(built.runs).toMatchObject({ runs: EXPLORE_RUNS, passes: EXPLORE_RUNS });
      expect(built.runs.worstMargin).toBeGreaterThan(0);
      expect(weaker.runs.passes).toBeLessThan(built.runs.passes);
      expect(weaker.changes).toEqual([{ joints: ['Shoulder'], variant: 'C046', mpn: 'ST-3215-C046' }]);
      expect(designLabel(space, weaker.design)).toBe('Shoulder C046');

      const scene = designScene(base, space, shoulderDown);

      expect(weaker.costUsd).toBe(buildBom({ ...scene, purchases: {}, measures: base.measures }).totals.estimatedUsd);
      expect(weaker.massG).toBe(robotWeight({ ...scene, measures: base.measures }).all.grams);
    },
    SIM_MS,
  );

  it('stops before the next design once stopped', async () => {
    let asked = 0;
    const rows = await exploreCase(base, {
      purchases: {},
      stopped: () => asked > 0,
      runs: async () => {
        asked++;

        return noRuns('stopped');
      },
    });

    expect(asked).toBe(1);
    expect(rows).toEqual([]);
  });
});
