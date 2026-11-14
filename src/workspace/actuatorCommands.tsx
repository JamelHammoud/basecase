import type { Command } from '../components/CommandPalette';
import { JointsIcon } from '../design-system';
import type { RobotJoint } from '../types/robotics';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { makeActuator } from './makeActuator';
import type { CommandInputs } from './sceneCommands';
import type { WorkspaceCore } from './useWorkspaceCore';

export function selectedJoint(core: WorkspaceCore): RobotJoint | undefined {
  const joints = core.project.joints ?? [];
  const active = joints.find((j) => j.id === core.posing.activeJointId);
  const [only] = core.selectedIds.length === 1 ? core.selectedIds : [];

  return active ?? joints.find((j) => !!only && j.actuators?.length === 1 && j.actuators[0] === only);
}

export function actuatorCommands({ core }: CommandInputs): Command[] {
  const joint = IS_WEB_DEMO ? undefined : selectedJoint(core);

  if (joint?.type !== 'revolute' || joint.actuators?.length !== 1) return [];

  return [
    {
      id: 'make-actuator',
      group: 'Selection',
      label: 'Make an Actuator',
      icon: <JointsIcon />,
      keywords: 'cycloidal reducer gearbox bldc motor servo torque joint printed generate',
      run: () => {
        core.tool.setRightTab('build');
        void makeActuator(core, { joint: joint.id });
      },
    },
  ];
}
