import type { Command } from '../components/CommandPalette';
import { PAIR_PHONE } from '../components/phone/pairPhoneLabel';
import { openTeachGesture, TEACH_GESTURE } from '../components/gestures/teachGestureStore';
import { DRIVE_WITH_CAMERA, driveWithCamera } from '../components/simulate/driveWithCamera';
import { operatorCameraSnapshot } from '../cameras/operator/operatorCamera';
import { CameraIcon, OperateIcon } from '../design-system';
import { canPairPhone, pairPhone, phoneSnapshot, unpairPhone } from '../phone/phoneStore';
import type { CommandInputs } from './sceneCommands';

export const INPUT_COMMANDS = ['pair-phone', 'unpair-phone', 'drive-camera', 'teach-gesture'];

function phoneCommands({ core }: CommandInputs): Command[] {
  if (!canPairPhone()) return [];

  if (phoneSnapshot().status === 'off')
    return [
      {
        id: 'pair-phone',
        group: 'Simulate',
        label: PAIR_PHONE,
        icon: <OperateIcon />,
        keywords: 'phone mobile iphone android tilt touch qr code drive steer remote controller',
        run: async () => {
          const reply = await pairPhone();

          if (reply && !reply.ok && reply.message) core.showToast(reply.message);
        },
      },
    ];

  return [
    {
      id: 'unpair-phone',
      group: 'Simulate',
      label: 'Unpair Phone',
      icon: <OperateIcon />,
      keywords: 'phone mobile disconnect stop',
      run: () => void unpairPhone(),
    },
  ];
}

function cameraCommands({ core }: CommandInputs): Command[] {
  const { sim } = core.simTraining;

  if (!core.posing.hasRig || !sim.drive.offersPose || sim.drive.active) return [];

  return [
    {
      id: 'drive-camera',
      group: 'Simulate',
      label: DRIVE_WITH_CAMERA,
      icon: <CameraIcon />,
      keywords: 'webcam mac camera arms hands pose body mirror teleop puppet motion capture mocap follow',
      run: () => {
        core.tool.setRightTab('sim');
        void driveWithCamera(sim.drive, core.showToast);
      },
    },
  ];
}

function gestureCommands({ core }: CommandInputs): Command[] {
  if (!operatorCameraSnapshot().open || !core.simTraining.cases.active) return [];

  return [
    {
      id: 'teach-gesture',
      group: 'Simulate',
      label: TEACH_GESTURE,
      icon: <CameraIcon />,
      keywords: 'gesture wave pose sign signal record example train camera body movement',
      run: openTeachGesture,
    },
  ];
}

export const inputCommands = (inputs: CommandInputs): Command[] => [
  ...cameraCommands(inputs),
  ...gestureCommands(inputs),
  ...phoneCommands(inputs),
];
