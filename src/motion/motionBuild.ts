import { specToPart } from '../agent/agentScene';
import { planMate } from '../agent/mate';
import { buildSkeleton } from '../agent/skeleton';
import { frameLookup } from '../agent/skeletonFrames';
import type { ScenePart } from '../types/robotics';
import type { RobotSkeleton, SkeletonJoint } from '../types/skeleton';
import type { MotionDesign } from '../utils/motionDesign';

export interface MotionScene {
  parts: () => ScenePart[];
  skeleton: () => RobotSkeleton | undefined;
  place: (parts: ScenePart[], skeleton: RobotSkeleton) => void;
}

export interface MotionBuild {
  parts: ScenePart[];
  skeleton: RobotSkeleton;
}

function uniqueId(id: string, used: Set<string>): string {
  let n = 1;
  let next = id;

  while (used.has(next)) next = `${id}-${++n}`;

  used.add(next);

  return next;
}

function servoAt(j: SkeletonJoint, id: string, group: string, skeleton: RobotSkeleton): ScenePart {
  const spec = { id, catalog: j.actuator!, position: j.origin, frame: j.id, group };
  const plan = planMate(
    [specToPart(spec)],
    { part: id, port: 'output', frame: j.id, type: 'press_fit' },
    frameLookup({ skeleton }),
  );

  if (typeof plan === 'string' || plan.op.op !== 'update') return specToPart(spec);

  return specToPart({ ...spec, position: plan.op.part.position, rotation: plan.op.part.rotation });
}

export function motionBuild(
  design: MotionDesign,
  name: string,
  scene: Pick<MotionScene, 'parts' | 'skeleton'>,
): MotionBuild {
  const skeleton = buildSkeleton({ ...design.skeleton, replace: true }, scene.skeleton()).skeleton;
  const used = new Set(scene.parts().map((p) => p.id));
  const servos = skeleton.joints
    .filter((j) => j.actuator)
    .map((j) => servoAt(j, uniqueId(`${j.id}-servo`, used), name, skeleton));

  return { parts: servos, skeleton };
}

export function placeMotionDesign(design: MotionDesign, name: string, scene: MotionScene): MotionBuild {
  const built = motionBuild(design, name, scene);

  scene.place([...scene.parts(), ...built.parts], built.skeleton);

  return built;
}
