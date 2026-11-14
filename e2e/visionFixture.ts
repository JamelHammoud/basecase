import { buildCase, builderRobot } from '../src/cases/caseBuilder';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { buildRig } from '../src/utils/kinematics';
import type { ScenePart } from '../src/types/robotics';
import { box } from '../src/sim/fixtures/parts';
import { DEFAULT_PROJECT } from '../src/types/robotics';

export function visionScene(color: string) {
  const wall = { ...box('wall', [0, 500, 0], [1000, 1000, 10], 100), color };

  return {
    name: 'Camera vision',
    parts: [wall],
    project: {
      ...DEFAULT_PROJECT,
      cameras: [
        {
          id: 'camera',
          name: 'Camera',
          position: [0, 500, 100],
          target: [0, 500, 0],
          lens: { model: 'pinhole', hfovDeg: 60 },
        },
      ],
    },
  };
}

export function wristVisionScene() {
  const robot = fixtureRobots().find((fixture) => fixture.id === 'arm-6dof')!;
  const camera: ScenePart = {
    ...box('wrist-camera', [0, 470, 0], [10, 25, 24], 3),
    name: 'Wrist',
    kind: 'component',
    componentId: 'raspberry-pi-camera-3',
    rotation: [-20, 0, 0],
    cameraLens: { model: 'pinhole', hfovDeg: 35 },
  };
  const parts = [...robot.parts, camera];
  const joints = robot.joints.map((joint) =>
    joint.id === 'arm5' ? { ...joint, child: [...joint.child, camera.id] } : joint,
  );
  const built = buildCase({ goal: 'pick', world: 'floor' }, builderRobot(buildRig(joints, parts), parts));

  if (!built.ok) throw new Error(built.problem);

  const kase = built.kase;
  const console = {
    input: ['keys'],
    panels: [
      { id: 'eye', kind: 'camera', title: 'Wrist', signal: 'camera.wrist' },
      { id: 'count', kind: 'value', title: 'Objects', signal: 'vision.wrist.block.count' },
      { id: 'go', kind: 'button', action: 'try' },
    ],
    layout: { areas: [{ size: 360, panels: ['eye', 'count', 'go'] }, { canvas: true }] },
  };

  return { name: 'Wrist vision', parts, project: { ...DEFAULT_PROJECT, joints, cases: [{ ...kase, console }] } };
}
