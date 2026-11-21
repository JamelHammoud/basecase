import type { WorldItem } from '../sim/mjcfTypes';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { worldItem, type Case } from './schema';

export function fixtureScene(kase: Case, name: string) {
  const objects = kase.world.objects.filter((object) => object.behavior === 'static' || object.joint || object.parent);
  const fixed = objects.filter((object) => object.behavior === 'static').map((object) => object.id);
  const parts = objects.map((object) => {
    const part: Partial<WorldItem> = { ...worldItem(object) };

    delete part.behavior;
    delete part.parent;
    delete part.joint;
    delete part.movable;

    return { ...(part as ScenePart), locked: false, group: { id: 'fixture-assembly', name } };
  });
  const joints = objects.flatMap((object): RobotJoint[] =>
    object.joint
      ? [
          {
            id: `${object.id}-joint`,
            name: object.name,
            type: object.joint.type,
            parent: object.parent ? [object.parent] : fixed,
            child: objects
              .filter((member) => member.id === object.id || member.parent === object.id)
              .map((member) => member.id),
            origin: object.joint.origin,
            axis: object.joint.axis,
            range: object.joint.range,
            actuation: 'passive',
            damping: object.joint.damping,
            frictionloss: object.joint.frictionloss,
            ...(object.joint.stiffness === undefined ? {} : { stiffness: object.joint.stiffness }),
            ...(object.joint.springref === undefined ? {} : { springref: object.joint.springref }),
          },
        ]
      : [],
  );

  return { name, parts, joints };
}
