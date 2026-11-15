import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { buildCase, builderRobot } from '../cases/caseBuilder';
import { CaseCheckSession, type WireRobot } from '../cases/caseCheckJob';
import { summarizeRuns } from '../cases/caseRuns';
import { EXPLORE_RUNS, type ExploreRobot } from '../cases/explore';
import { exploreSpace, type Design } from '../cases/exploreDesigns';
import type { Case } from '../cases/schema';
import { componentSize } from '../data/components';
import { box, fixtureMeasures, fixtureTriangles, type FixtureRobot } from '../sim/fixtures/parts';
import { withServos } from '../sim/fixtures/servoLegs';
import { DEFAULT_PROJECT } from '../types/robotics';
import { sizeActuators } from '../utils/actuatorSizing';
import { sizingJoints } from '../utils/actuatorSizingInput';
import { editMeasures, editTriangles, servosUsd, sweepVariants, type SweepParameter } from '../utils/designSweep';
import { reportMetrics } from '../utils/designSweepTable';
import { runEngineering } from '../utils/engineering';
import { buildRig } from '../utils/kinematics';
import { referenceExploreCase } from './parityReference.testSupport';
import { runStudy, studyScene } from './study';
import type { StudyKnob, StudyScene } from './types';

function sceneOf(robot: FixtureRobot): StudyScene {
  const parts = robot.parts.map((part) =>
    part.componentId
      ? { ...part, dimensions: componentSize(part.componentId), massG: undefined, com: undefined }
      : part,
  );
  const triangles = fixtureTriangles(parts);

  return {
    parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
    measures: fixtureMeasures(parts),
    triangles: Object.fromEntries(parts.map((part) => [part.id, triangles(part.id)!])),
  };
}

function quadruped(): StudyScene {
  const robot = withServos('quad-servo', { componentId: 'feetech-sts3250' });
  const feet = robot.parts
    .filter((part) => part.id.endsWith('_lower'))
    .map((part) => box(`${part.id}_foot`, [part.position[0], 4, part.position[2]], [32, 8, 45], 0));
  const battery = {
    ...box('battery', [0, 165, 0], [35, 30, 110], 0),
    kind: 'component' as const,
    componentId: 'ovonic-4s-2200-35c',
  };
  const joints = robot.joints.map((joint) => ({
    ...joint,
    child: [
      ...joint.child,
      ...feet.filter((foot) => joint.child.includes(foot.id.replace(/_foot$/, ''))).map((f) => f.id),
    ],
  }));

  return sceneOf({ ...robot, parts: [...robot.parts, ...feet, battery], joints });
}

function referenceSweep(base: StudyScene, parameter: SweepParameter): StudyScene {
  const variants = sweepVariants(base.parts, base.project.joints ?? [], parameter);

  if (typeof variants === 'string') throw new Error(variants);

  const variant = variants[0];

  return {
    ...base,
    parts: variant.parts,
    measures: editMeasures(base.measures, base.parts, variant.edits),
    triangles: Object.fromEntries(
      base.parts.map((part) => {
        const edit = variant.edits.get(part.id);
        const triangles = base.triangles[part.id];

        return [part.id, edit ? editTriangles(triangles, part, edit, base.measures[part.id]) : triangles];
      }),
    ),
  };
}

function sweepMetrics(scene: StudyScene) {
  const report = runEngineering({ ...scene, servoOutputs: {} });
  const joints = sizingJoints(report, scene.parts, scene.project.joints ?? []);
  const sizedUsd = joints.length
    ? sizeActuators({ joints, totalG: report.massG }).find((set) => !set.failures.length)?.costUsd
    : undefined;

  return reportMetrics(report, { servosUsd: servosUsd(scene.parts, scene.project.joints ?? []), sizedUsd });
}

function makeCase(scene: StudyScene): Case {
  const rig = buildRig(scene.project.joints ?? [], scene.parts);
  const built = buildCase(
    { goal: 'reach', world: 'floor', values: { distanceMm: 200, radiusMm: 25, seconds: 2 } },
    builderRobot(rig, scene.parts),
  );

  if (!built.ok) throw new Error(built.problem);

  return built.kase;
}

async function seededRuns(mj: MainModule, kase: Case, robot: WireRobot) {
  const session = new CaseCheckSession();
  const model = await session.run(mj, { type: 'model', robot, walks: [] });

  if (model.type !== 'model') throw new Error('No model result.');

  const reply = await session.run(mj, {
    type: 'runs',
    kase,
    modelHash: model.modelHash,
    seeds: Array.from({ length: EXPLORE_RUNS }, (_, index) => index + 1),
    walk: null,
    stop: model.stop,
  });

  if (reply.type !== 'runs') throw new Error('No run result.');

  return summarizeRuns([reply.result]);
}

function wireScene(scene: StudyScene, volts?: number): WireRobot {
  return {
    id: 'scene',
    parts: scene.parts,
    joints: scene.project.joints ?? [],
    measures: scene.measures,
    triangles: scene.triangles,
    servoVolts: volts ?? scene.project.tether?.volts,
  };
}

describe('Study parity with the previous design tools', () => {
  it('matches quadruped single sweeps on both axes and composes their transforms and metrics', async () => {
    const base = quadruped();
    const before = structuredClone(base);
    const knobs: StudyKnob[] = [
      {
        id: 'pack',
        kind: 'battery_offset',
        values: [
          [0, 0, 0],
          [15, 30, -10],
        ],
      },
      {
        id: 'feet',
        kind: 'foot',
        values: [
          { length: 1, width: 1 },
          { length: 1.4, width: 1.2 },
        ],
      },
    ];
    const rows = await runStudy(base, { knobs });
    const battery = referenceSweep(base, { kind: 'battery', values: [[15, 30, -10]] });
    const foot = { kind: 'foot' as const, values: [{ length: 1.4, width: 1.2 }] };
    const expected = [base, referenceSweep(base, foot), battery, referenceSweep(battery, foot)];

    expect(rows.map((row) => row.selection)).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);

    for (const [index, row] of rows.entries()) {
      const chosen = await studyScene(base, knobs, row.selection);

      expect(row.error).toBeUndefined();
      expect(chosen.parts).toEqual(expected[index].parts);
      expect(chosen.measures).toEqual(expected[index].measures);
      expect(chosen.triangles).toEqual(expected[index].triangles);
      expect(row.metrics).toEqual(sweepMetrics(expected[index]));
    }

    expect(rows[1].metrics.tipDeg).toBeGreaterThan(rows[0].metrics.tipDeg!);
    expect(rows[2].metrics.tipDeg).toBeLessThan(rows[0].metrics.tipDeg!);
    expect(base).toEqual(before);
  });

  it('matches prior Explore servo and voltage rows through the seeded rover Case pipeline', async () => {
    const mj = await loadMujoco();
    const base = sceneOf(withServos('rover-diff', { componentId: 'feetech-sts3215', variant: 'c044' }));
    const knobs: StudyKnob[] = [
      {
        id: 'servos',
        kind: 'servo',
        joints: base.project.joints!.map((joint) => joint.id),
        values: ['component:feetech-sts3215|c044', 'component:feetech-sts3215|c046'],
      },
      { id: 'supply', kind: 'voltage', values: [6, 7.4] },
    ];
    const kase = makeCase(base);
    const space = exploreSpace(base.parts, base.project)!;
    const rows = await runStudy(base, { knobs, runs: (scene) => seededRuns(mj, kase, wireScene(scene)) });
    const designs: Design[] = rows.map((row) => ({
      variants: space.groups.map(() => (row.selection[0] === 0 ? 'c044' : 'c046')),
      volts: knobs[1].values[row.selection[1]] as number,
    }));
    const previous = await referenceExploreCase(
      {
        ...base,
        partTriangles: (id) => base.triangles[id] ?? null,
      },
      {
        purchases: {},
        designs,
        runs: (robot: ExploreRobot) =>
          seededRuns(mj, kase, wireScene({ ...base, parts: robot.parts, project: robot.project }, robot.servoVolts)),
      },
    );

    expect(rows).toHaveLength(4);

    for (const [index, row] of rows.entries()) {
      expect(row.error).toBeUndefined();
      expect(row.runs).toMatchObject({ runs: EXPLORE_RUNS, refusal: null });
      expect(row.runs?.outcomes.map((outcome) => outcome.seed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(row.runs).toEqual(previous[index].runs);
      expect(row.costUsd).toBe(previous[index].costUsd);
      expect(row.massG).toBe(previous[index].massG);
    }

    expect(rows[0].runs?.passes).toBeGreaterThan(0);
  });
});
