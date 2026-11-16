import { fleetIncidents, inspectUnitProblems } from '../robot/fleetIncidentStore';
import type { Command } from '../components/CommandPalette';
import { OperateIcon } from '../design-system';
import { canCalibrate } from '../robot/calibrationSession';
import { emulatedSpec } from '../robot/emulatedUnits';
import { connectRobot, disconnectRobot, fleetSnapshot, robotSnapshot } from '../robot/robotStore';
import { servoFamily } from '../robot/robotState';
import { sceneRobot } from '../robot/sceneRobot';
import { canSetUpServos, servoSetup, setUpServos } from '../robot/servoSetup';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { calibrateConnectedRobot } from './calibrationActions';
import { replayableFault, replayRobotRun } from './robotReplay';
import type { CommandInputs } from './sceneCommands';
import { showLeftTab } from './showView';
import type { WorkspaceCore } from './useWorkspaceCore';
import { addRobotComputer } from './robotComputer';
import { bodyRobot, fitBodyFromUi } from './bodyActions';

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
      run: () => replayRobotRun(core, messageId),
    },
  ];
}

const DISCONNECT: Command = {
  id: 'disconnect-robot',
  group: 'Operate',
  label: 'Disconnect Robot',
  icon: <OperateIcon />,
  keywords: 'robot daemon emulated servos stop unit fleet',
  run: () => void disconnectRobot(),
};

function linkCommands({ core }: CommandInputs, showOperate: () => void): Command[] {
  const joints = core.project.joints ?? [];
  const robot = sceneRobot(joints);
  const connected = robotSnapshot().link === 'connected' ? [DISCONNECT] : [];

  if (!robot.ok) return connected;

  return [
    ...connected,
    {
      id: 'connect-emulated-robot',
      group: 'Operate',
      label: 'Connect Emulated Robot',
      icon: <OperateIcon />,
      keywords: 'robot daemon emulated servos feetech unitree g1 fleet unit add another',
      run: () => {
        showOperate();
        void connectRobot(emulatedSpec({ choice: robot, joints, parts: core.parts }), robot.joints);
      },
    },
  ];
}

function rollOutCommands(core: WorkspaceCore, showOperate: () => void): Command[] {
  const { fleet, skills } = core.simTraining;

  return skills.rows.filter(fleet.canRollOut).map((row) => ({
    id: `roll-out-${row.target}`,
    group: 'Operate',
    label: `Roll Out ${row.label}`,
    icon: <OperateIcon />,
    keywords: 'fleet canary canaries deploy skill policy units robots twin arena',
    run: () => {
      showOperate();
      fleet.rollOut(row);
    },
  }));
}

function rollBackCommands(core: WorkspaceCore, showOperate: () => void): Command[] {
  return fleetSnapshot()
    .units.filter((unit) => unit.hasPrevious)
    .map((unit) => ({
      id: `roll-back-${unit.unit}`,
      group: 'Operate',
      label: `Roll Back ${unit.unit}`,
      icon: <OperateIcon />,
      keywords: 'fleet previous version policy robot unit',
      run: () => {
        showOperate();
        void core.simTraining.fleet.tools.rollBack(unit.unit);
      },
    }));
}

function problemCommands(showOperate: () => void): Command[] {
  return [...new Set(fleetIncidents.items.map((i) => i.unit))].map((unit) => ({
    id: `inspect-problems-${unit}`,
    group: 'Operate',
    label: `Inspect Problems for ${unit}`,
    icon: <OperateIcon />,
    keywords: 'fleet alerts incidents fault acknowledge history',
    run: () => {
      showOperate();
      inspectUnitProblems(unit);
    },
  }));
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
    {
      id: 'add-robot-computer',
      group: 'Operate',
      label: 'Add a Robot Computer',
      icon: <OperateIcon />,
      keywords: 'network robot raspberry pi jetson linux ssh host pairing daemon install',
      run: () => {
        showOperate();
        addRobotComputer(core);
      },
    },
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
    ...(bodyRobot(core)
      ? [
          {
            id: 'fit-body',
            group: 'Operate',
            label: 'Fit Body',
            icon: <OperateIcon />,
            keywords: 'calibration mass payload friction robot sim twin',
            run: () => {
              showOperate();
              fitBodyFromUi(core);
            },
          },
        ]
      : []),
    ...replayCommands(core),
    ...rollOutCommands(core, showOperate),
    ...rollBackCommands(core, showOperate),
    ...problemCommands(showOperate),
  ];
}
