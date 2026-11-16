import { component, hexapod, mixedArm, rover, sceneOf, servoJoints, so101 } from './fixtures';
import { POWER_MODULES } from './electricalModules';
import type { SourcedItem } from '../data/sourcedItems';
import { electricalRobot } from './electricalRobots';

export function mappedGripper() {
  const scene = servoRobot(1, 'arm');
  const sourced: SourcedItem[] = POWER_MODULES.map((module) => ({
    id: module.id,
    kind: 'part',
    name: `${module.maker} ${module.mpn} ${module.role}`,
    maker: module.maker,
    mpn: module.mpn,
    spec: module.map.sourceLocator,
    url: module.map.source,
    sources: [{ claim: 'Electrical interface and ratings', url: module.map.source }],
    addedAt: '2026-11-16',
    link: { status: 'confirmed', checkedAt: '2026-11-16' },
  }));

  return {
    ...scene,
    project: {
      ...scene.project,
      tether: { volts: 5, amps: 3 },
      sourced,
      extras: sourced.map((item) => ({ key: `supply:${item.id}`, qty: 1 })),
    },
  };
}

function servoRobot(count: number, limb?: 'leg' | 'arm') {
  const robot = servoJoints({ prefix: 'servo', componentId: 'feetech-sts3215', variant: 'c001', count, limb });

  return sceneOf([component('adapter', 'waveshare-bus-servo-adapter-a'), ...robot.parts], robot.joints, {
    tether: { volts: 6, amps: 20 },
  });
}

function panTilt() {
  const robot = servoRobot(2);

  return { ...robot, parts: [...robot.parts, component('camera', 'raspberry-pi-camera-3')] };
}

function inspection() {
  const robot = servoRobot(4);

  return {
    ...robot,
    parts: [
      ...robot.parts,
      component('computer', 'raspberry-pi-5'),
      component('depth', 'realsense-d435'),
      component('imu', 'adafruit-bno085'),
      component('range', 'adafruit-vl53l1x'),
    ],
  };
}

function dualBus() {
  const robot = servoRobot(3, 'arm');
  const second = servoJoints({ prefix: 'xl', componentId: 'dynamixel-xl330-m288', count: 2, limb: 'arm' });

  return sceneOf(
    [...robot.parts, component('second', 'robotis-u2d2'), ...second.parts],
    [...robot.project.joints!, ...second.joints],
  );
}

export function electricalScenes() {
  return [
    { name: 'tethered-so101', scene: so101(), mappedServos: 6 },
    { name: 'battery-rover', scene: rover(), mappedServos: 2 },
    { name: 'quadruped', scene: servoRobot(12, 'leg'), mappedServos: 12 },
    { name: 'hexapod', scene: hexapod(), mappedServos: 18 },
    { name: 'pan-tilt-camera', scene: panTilt(), mappedServos: 2 },
    { name: 'gripper', scene: mappedGripper(), mappedServos: 1 },
    { name: 'mixed-voltage', scene: mixedArm(), mappedServos: 3 },
    { name: 'dual-bus-arm', scene: dualBus(), mappedServos: 5 },
    { name: 'sensor-rich-inspection', scene: inspection(), mappedServos: 4 },
    { name: 'fixed-appliance', scene: servoRobot(1), mappedServos: 1 },
  ].map((entry) => ({ ...entry, scene: electricalRobot(entry.name, entry.scene) }));
}
