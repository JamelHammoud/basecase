import type { StudyKnob } from '../../study/types';
import type { RobotJoint, ScenePart } from '../../types/robotics';
import { box } from './parts';
import { fixtureRobots } from './robots';

export function studyQuad() {
  const robot = fixtureRobots().find((r) => r.id === 'quad-servo')!;
  const raised: ScenePart[] = robot.parts.map((part) => ({
    ...part,
    position: [part.position[0], part.position[1] + 8, part.position[2]],
  }));
  const lower = raised.filter((part) => part.id.endsWith('_lower'));
  const feet = lower.map((part, index): ScenePart => ({
    ...box(`study-foot-${index}`, [part.position[0], 4, part.position[2]], [30, 8, 45], 0),
    name: `Foot ${index + 1}`,
    massG: undefined,
  }));
  const attached = new Map(lower.map((part, index) => [part.id, feet[index].id]));
  const joints: RobotJoint[] = robot.joints.map((joint) => ({
    ...joint,
    origin: [joint.origin[0], joint.origin[1] + 8, joint.origin[2]],
    child: [...joint.child, ...joint.child.flatMap((id) => attached.get(id) ?? [])],
  }));
  const ids = feet.map((foot) => foot.id);
  const knobs: StudyKnob[] = [
    { id: 'foot-length', label: 'Foot length', kind: 'foot', parts: ids, values: [{ length: 1 }, { length: 1.25 }] },
    {
      id: 'foot-width',
      label: 'Foot width',
      kind: 'foot',
      parts: ids,
      values: [{ width: 1 }, { width: 1.25 }, { width: 1.5 }],
    },
  ];

  return { ...robot, id: 'study-quad', parts: [...raised, ...feet], joints, feet: ids, knobs };
}
