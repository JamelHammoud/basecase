import type { Command } from '../components/CommandPalette';
import { OperateIcon } from '../design-system';
import { canCalibrate } from '../robot/calibrationSession';
import { emulatedSpec } from '../robot/emulatedUnits';
import { connectRobot, disconnectRobot, robotSnapshot } from '../robot/robotStore';
import { servoFamily } from '../robot/robotState';
import { sceneRobot } from '../robot/sceneRobot';
import { canSetUpServos, servoSetup, setUpServos } from '../robot/servoSetup';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { calibrateConnectedRobot } from './calibrationActions';
import { replayableFault, replayRobotRun } from './robotReplay';
import type { CommandInputs } from './sceneCommands';
import { showLeftTab } from './showView';
import type { WorkspaceCore } from './useWorkspaceCore';

const showOperateOf = (core: WorkspaceCore) => () => showLeftTab(core, 'operate');

export function calibrateJoints(core: WorkspaceCore, only?: readonly string[]) {
  const joints = core.project.joints ?? [];

  showOperateOf(core)();

  if (canCalibrate(joints))
    void calibrateConnectedRobot(core.docs.updateProjectNow, {
      joints,
      parts: core.parts,
      project: core.project,
      only,
    });
}

function setUpServosCommands({ core }: CommandInputs, showOperate: () => void): Command[] {
  const joints = core.project.joints ?? [];

  if (servoSetup() || !canSetUpServos(joints, robotSnapshot())) return [];

  return [
    {
      id: 'set-up-servos',
      group: 'Operate',
      label: 'Set Up Servos',
      icon: <OperateIcon />,
      keywords: 'servo ids number assign factory plug emulated robot',
      run: () => {
        showOperate();
        void setUpServos({ joints, parts: core.parts, select: core.setSelectedIds });
      },
    },
  ];
}

function replayCommands(core: WorkspaceCore): Command[] {
  const messageId = replayableFault(core);

  if (messageId === null) return [];

  return [
    {
      id: 'replay-in-sim',
      group: 'Operate',
      label: 'Replay in Sim',
      icon: <OperateIcon />,
      keywords: 'fault stall replay robot run case simulate torque',
      run: () => void replayRobotRun(core, messageId),
    },
  ];
}

function linkCommands({ core }: CommandInputs, showOperate: () => void): Command[] {
  const joints = core.project.joints ?? [];
  const robot = sceneRobot(joints);

  if (robotSnapshot().link === 'connected')
    return [
      {
        id: 'disconnect-robot',
        group: 'Operate',
        label: 'Disconnect Robot',
        icon: <OperateIcon />,
        keywords: 'robot daemon emulated servos stop',
        run: () => void disconnectRobot(),
      },
    ];

  if (!robot.ok) return [];

  return [
    {
      id: 'connect-emulated-robot',
      group: 'Operate',
      label: 'Connect Emulated Robot',
      icon: <OperateIcon />,
      keywords: 'robot daemon emulated servos feetech unitree g1',
      run: () => {
        showOperate();
        void connectRobot(emulatedSpec({ choice: robot, joints, parts: core.parts }), robot.joints);
      },
    },
  ];
}

export function operateCommands(inputs: CommandInputs): Command[] {
  const { core } = inputs;

  if (IS_WEB_DEMO) return [];

  const showOperate = showOperateOf(core);
  const joints = core.project.joints ?? [];
  const robot = sceneRobot(joints);

  return [
    {
      id: 'show-operate',
      group: 'Panels',
      label: 'Show Operate',
      icon: <OperateIcon />,
      keywords: 'robot daemon emulated servos operate hardware',
      run: showOperate,
    },
    ...linkCommands(inputs, showOperate),
    ...(robot.ok && servoFamily(robot.spec)
      ? [
          {
            id: 'calibrate-robot',
            group: 'Operate',
            label: 'Calibrate Servos',
            icon: <OperateIcon />,
            keywords: 'calibration fit servos emulated robot sim twin',
            run: () => calibrateJoints(core),
          },
        ]
      : []),
    ...setUpServosCommands(inputs, showOperate),
    ...replayCommands(core),
  ];
}
