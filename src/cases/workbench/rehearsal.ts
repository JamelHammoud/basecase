import type { MainModule } from '@mujoco/mujoco';
import { Vector3 } from 'three';
import { buildRig, solveIK } from '../../utils/kinematics';
import type { JointValues } from '../../types/robotics';
import { simDelta } from '../../sim/mjcfFrames';
import { boundEffector, robotFacts } from '../robotFit';
import { runCase, type CaseRobot, type CaseResult } from '../runCase';
import { caseSlots, type Case } from '../schema';
import { seedReplay, type SeedReplay } from '../seedReplay';
import { robotPivot } from '../slots';
import { placementFrame, relocateCase, relocationRefusal, type WorkbenchPose } from './placement';
import { placementIdentity, type PlacementIdentity, type RetainedPlacement } from './retention';
import { staticPlacementCollision } from './staticCollision';

export interface WorkbenchInput {
  unit: string;
  kase: Case;
  robot: CaseRobot;
  pose: WorkbenchPose;
}

export interface WorkbenchResult {
  identity: PlacementIdentity;
  rehearsal: NonNullable<RetainedPlacement['rehearsal']>;
  replay: SeedReplay | null;
  preparationMs: number;
  simulationMs: number;
  analysisMs: number;
}

const TARGET_TOLERANCE_MM = 5;

function targetRefusal(kase: Case, robot: CaseRobot): string | null {
  const rig = buildRig(robot.joints, robot.parts);
  const facts = robotFacts(rig, robot.parts);
  const effector = boundEffector(caseSlots(kase)[0].binding, facts, rig);

  if (facts.morphology !== 'fixed' || !effector) return 'Choose a fixed arm with an end effector.';

  const toolOffset = facts.endEffector
    ? new Vector3(...effector.point).distanceTo(new Vector3(...facts.endEffector.point))
    : 0;
  let values: JointValues = {};

  for (const command of [...kase.reference.timeline].sort((a, b) => a.at - b.at)) {
    if (!command.target) continue;

    const target = command.target;
    const distance = new Vector3(...target).distanceTo(new Vector3(...facts.anchor));

    if (distance > facts.reachMm + toolOffset + TARGET_TOLERANCE_MM)
      return 'Reference target is outside the arm’s reach.';

    const solved = solveIK(rig, values, [{ partId: effector.part, point: effector.point, target }], {
      joints: facts.armJoints,
      tolerance: 0.5,
      iterations: 64,
      preferWeight: 0,
    });

    if (solved.maxError > TARGET_TOLERANCE_MM) return 'Reference target is unresolved at this placement.';

    values = solved.values;
  }

  return null;
}

function obstructed(result: CaseResult): boolean {
  const { recording, model } = result;
  const staticIds = new Set(
    result.case.world.objects.filter((object) => object.behavior === 'static').map((object) => object.id),
  );
  const fixtures = new Set(
    model.bodies.flatMap((body, index) => (body.world?.some((id) => staticIds.has(id)) ? [index] : [])),
  );
  const moving = new Set(model.bodies.flatMap((body, index) => (body.robot && body.joint ? [index] : [])));
  const contacts = recording?.contacts ?? [];

  for (let i = 0; i + 1 < contacts.length; i += 2) {
    const a = contacts[i];
    const b = contacts[i + 1];

    if ((fixtures.has(a) && moving.has(b)) || (fixtures.has(b) && moving.has(a))) return true;
  }

  return false;
}

function toolTravel(result: CaseResult, input: WorkbenchInput): number | null {
  const rig = buildRig(input.robot.joints, input.robot.parts);
  const effector = boundEffector(caseSlots(input.kase)[0].binding, robotFacts(rig, input.robot.parts), rig);

  if (!effector || result.frames.length < 2) return null;

  let previous: Vector3 | null = null;
  let travel = 0;

  for (const frame of result.frames) {
    const delta = simDelta(result.model, frame.poses, effector.part);

    if (!delta) return null;

    const point = new Vector3(...effector.point).applyMatrix4(delta);

    if (!point.toArray().every(Number.isFinite)) return null;

    travel += previous?.distanceTo(point) ?? 0;
    previous = point;
  }

  return travel;
}

function physicalRefusal(mj: MainModule, result: CaseResult, travel: number | null): string | null {
  if (result.refusal) return result.refusal;

  const fixed = staticPlacementCollision(mj, result.model);

  if (obstructed(result) || fixed === 'obstructed') return 'Reference motion is obstructed at this placement.';

  return travel === null || fixed === 'unresolved' ? 'Reference motion is unresolved at this placement.' : null;
}

export async function rehearseWorkbench(
  mj: MainModule,
  input: WorkbenchInput,
  retainReplay = true,
): Promise<WorkbenchResult> {
  const started = performance.now();
  const identity = placementIdentity(input);
  const relocated = relocateCase(input.kase, input.pose, robotPivot(input.robot));
  const refusal = relocationRefusal(input.kase) ?? targetRefusal(relocated, input.robot);
  const preparationMs = performance.now() - started;

  if (refusal)
    return {
      identity,
      rehearsal: { passed: false, margin: -1, failed: [], refusal },
      replay: null,
      preparationMs,
      simulationMs: 0,
      analysisMs: 0,
    };

  const stepping = performance.now();
  const worldFloorMm = placementFrame(input.pose, robotPivot(input.robot)).at([0, 0, 0])[1];
  const result = await runCase(mj, relocated, input.robot, { controller: 'reference', record: true, worldFloorMm });
  const simulationMs = performance.now() - stepping;
  const analyzing = performance.now();
  const travelMm = toolTravel(result, input);
  const physical = physicalRefusal(mj, result, travelMm);
  const rehearsal = {
    passed: result.passed && !physical,
    margin: result.margin,
    failed: result.failed,
    ...(travelMm === null ? {} : { travelMm }),
    ...(physical ? { refusal: physical } : {}),
  };
  const analysisMs = performance.now() - analyzing;
  const replay = result.recording && retainReplay ? await seedReplay(mj, { ...result, ...rehearsal }, 0, false) : null;

  return { identity, rehearsal, replay, preparationMs, simulationMs, analysisMs };
}
