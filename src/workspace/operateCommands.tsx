import type { Command } from '../components/CommandPalette';
import { OperateIcon } from '../design-system';
import { canCalibrate } from '../robot/calibrationSession';
import { connectRobot, robotSnapshot } from '../robot/robotStore';
import { sceneRobot } from '../robot/sceneRobot';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { calibrateConnectedRobot } from './calibrationActions';
import type { CommandInputs } from './sceneCommands';

const ic = 'w-4 h-4';

export function operateCommands({ core }: CommandInputs): Command[] {
  if (IS_WEB_DEMO) return [];

  const showOperate = () => {
    core.tool.setLeftTab('operate');
    core.studio.setIsLeftOpen(true);
  };
  const joints = core.project.joints ?? [];
  const robot = sceneRobot(joints);

  return [
    {
      id: 'show-operate',
      group: 'Panels',
      label: 'Show Operate',
      icon: <OperateIcon className={ic} />,
      keywords: 'robot daemon emulated servos operate hardware',
      run: showOperate,
    },
    ...(robot.ok
      ? [
          {
            id: 'connect-emulated-robot',
            group: 'Operate',
            label: 'Connect Emulated Robot',
            icon: <OperateIcon className={ic} />,
            keywords: 'robot daemon emulated servos feetech',
            run: () => {
              showOperate();

              if (robotSnapshot().link !== 'connected') void connectRobot(robot.spec, robot.joints);
            },
          },
          {
            id: 'calibrate-robot',
            group: 'Operate',
            label: 'Calibrate Servos',
            icon: <OperateIcon className={ic} />,
            keywords: 'calibration fit servos emulated robot sim twin',
            run: () => {
              showOperate();

              if (canCalibrate(joints)) void calibrateConnectedRobot(core.docs.updateProjectNow, joints);
            },
          },
        ]
      : []),
  ];
}
