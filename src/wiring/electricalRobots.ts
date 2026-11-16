import { componentSize } from '../data/components';
import { box, type P3 } from '../sim/fixtures/parts';
import type { WiringFixture } from './fixtures';

function positionFor(name: string, index: number): P3 {
  if (name === 'quadruped' || name === 'hexapod')
    return [
      (Math.floor(index / 3) % 2 ? 1 : -1) * (90 + (index % 3) * 35),
      65 - (index % 3) * 20,
      (Math.floor(index / 6) - 1) * 95,
    ];

  if (name === 'battery-rover' || name === 'sensor-rich-inspection')
    return [index % 2 ? 110 : -110, 45, Math.floor(index / 2) * 100 - 50];

  return [index * 55, 55 + index * 15, 0];
}

function parentLink(name: string, index: number) {
  if (name === 'quadruped' || name === 'hexapod') return index % 3 ? `link-${index}` : 'base';

  if (name === 'battery-rover' || name === 'sensor-rich-inspection' || name === 'fixed-appliance') return 'base';

  if ((name === 'dual-bus-arm' || name === 'mixed-voltage') && index === 3) return 'base';

  return index ? `link-${index}` : 'base';
}

export function electricalRobot(name: string, scene: WiringFixture): WiringFixture {
  const joints = scene.project.joints ?? [];
  const actuatorIds = new Map(
    joints.flatMap((joint, index) => (joint.actuators ?? []).map((id): [string, number] => [id, index])),
  );
  const parts = scene.parts.map((part, index) => ({
    ...part,
    position: actuatorIds.has(part.id)
      ? positionFor(name, actuatorIds.get(part.id)!)
      : ([-80, 30, index * 55 - 100] as P3),
    dimensions: part.componentId ? componentSize(part.componentId) : part.dimensions,
  }));
  const links = joints.map((_, index) =>
    box(`link-${index + 1}`, positionFor(name, index), name === 'fixed-appliance' ? [8, 90, 110] : [16, 60, 16], 30),
  );
  const moving = joints.map((joint, index) => ({
    ...joint,
    name: name === 'fixed-appliance' ? 'Appliance hatch' : joint.name,
    parent: [parentLink(name, index), ...(joint.actuators ?? [])],
    child: [`link-${index + 1}`, ...(name === 'pan-tilt-camera' && index === joints.length - 1 ? ['camera'] : [])],
    origin: positionFor(name, index),
  }));

  return {
    parts: [box('base', [0, 0, 0], [200, 12, 160], 500), ...parts, ...links],
    project: { ...scene.project, joints: moving },
  };
}
