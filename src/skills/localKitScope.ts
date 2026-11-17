import type { RobotSchema } from './robotSchema';

const PAIRS = new Set(['4:4', '6:6', '6:5']);

function threeJointLegs(schema: RobotSchema) {
  return (
    schema.floating &&
    schema.bodyClass === 'legged' &&
    schema.joints.length === schema.limbs.length * 3 &&
    schema.joints.every((joint) => joint.depth >= 1 && joint.depth <= 3)
  );
}

export function measuredKitMapping(source: RobotSchema, target: RobotSchema) {
  return threeJointLegs(source) && threeJointLegs(target) && PAIRS.has(`${source.limbs.length}:${target.limbs.length}`);
}
