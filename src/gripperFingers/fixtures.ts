import { Vector3 } from 'three';
import { fixtureRobots } from '../sim/fixtures/robots';
import { specToPart } from '../agent/agentScene';
import type { RenderedCad } from '../utils/platform/types';
import type { FixtureRobot } from '../sim/fixtures/parts';
import { DEFAULT_MOUNT, mountCode } from './cad';
import type { MountDimensions } from './types';
import { fingerFrame } from './frames';

export async function fingerFixtures(
  compile: (code: string) => Promise<RenderedCad>,
  mounting: MountDimensions = DEFAULT_MOUNT,
  travel = 22,
): Promise<FixtureRobot> {
  const arm = fixtureRobots().find((robot) => robot.id === 'arm-6dof')!;
  const code = mountCode(mounting);
  const rendered = await compile(code);

  if (!rendered.ok || !rendered.positions || !rendered.indices) throw new Error(rendered.error);

  const parts = arm.parts.map((part) => {
    if (!part.id.startsWith('finger_')) return part;

    const left = part.id === 'finger_left';
    const local = specToPart({
      id: part.id,
      name: part.name,
      shape: 'cad_part',
      cad: {
        language: 'openscad',
        code,
        positions: rendered.positions!,
        indices: rendered.indices!,
        stats: rendered.stats,
        ports: rendered.ports,
      },
    });
    const rotation: [number, number, number] = [0, left ? 0 : 180, 0];
    const root: [number, number, number] = [
      left ? -25 : 25,
      part.position[1] - part.dimensions.height / 2 + mounting.height,
      0,
    ];
    const frame = fingerFrame({ ...local, position: root, rotation, cad: undefined });

    return {
      ...local,
      position: new Vector3(...local.position)
        .applyQuaternion(frame.rotation)
        .add(new Vector3(...root))
        .toArray() as [number, number, number],
      rotation,
    };
  });
  const joints = arm.joints.map((joint) =>
    joint.id.startsWith('finger_')
      ? { ...joint, range: (joint.id === 'finger_left' ? [0, travel] : [-travel, 0]) as [number, number] }
      : joint,
  );

  return { ...arm, parts, joints };
}
