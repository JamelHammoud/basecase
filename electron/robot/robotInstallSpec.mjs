import { checkedRobotSpec, emulatedCalibration } from './robotSpec.mjs';
import { G1_JOINT_NAMES, G1_WRITABLE_IDS } from './unitreeG1.mjs';

function g1Calibration(map, calibration) {
  if (map.joints.length !== G1_JOINT_NAMES.length) throw new Error('The G1 joint map needs its 29 named joints.');

  const names = map.joints.map((joint) => joint.joint ?? joint.name);

  if (new Set(names).size !== names.length || !G1_JOINT_NAMES.every((name) => names.includes(name)))
    throw new Error('The G1 joint map needs its 29 named joints.');

  return {
    class: 'legged',
    joints: G1_WRITABLE_IDS.map((id) => ({
      ...calibration.joints[names.indexOf(G1_JOINT_NAMES[id - 1])],
      id,
      name: G1_JOINT_NAMES[id - 1],
    })),
  };
}

export function installationSpec(ask, map, calibration) {
  const inferred = map.joints.map((joint) => joint.family).filter(Boolean);
  const spec = ask ?? {
    family: inferred[0] ?? 'feetech',
    ids: calibration.joints.map(({ id }) => id),
    class: map.class,
    emulated: true,
  };
  const checked = checkedRobotSpec(spec);

  if (!checked.ok) throw new Error(checked.message);

  if (checked.spec.family === 'unitree-g1') return { spec: checked.spec, calibration: g1Calibration(map, calibration) };

  if (checked.spec.family === 'ros2') return rosCalibration(checked.spec, calibration);

  if (new Set(inferred).size > 1 || inferred.some((family) => family !== checked.spec.family))
    throw new Error('Choose one servo family with a separate ID for each joint.');

  if (
    checked.spec.ids.join(',') !== calibration.joints.map(({ id }) => id).join(',') ||
    checked.spec.class !== calibration.class
  )
    throw new Error('The servo IDs and robot class must match the joint map.');

  return { spec: checked.spec, calibration };
}

function rosCalibration(spec, calibration) {
  if (spec.joints.length !== calibration.joints.length) throw new Error('The ROS 2 joints must match the joint map.');

  const defaults = emulatedCalibration(spec);

  return {
    spec,
    calibration: {
      ...defaults,
      joints: calibration.joints.map((joint, index) => ({
        ...joint,
        id: defaults.joints[index].id,
        name: spec.joints[index],
      })),
    },
  };
}
