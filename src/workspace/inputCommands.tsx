import type { Command } from '../components/CommandPalette';
import { PAIR_PHONE } from '../components/phone/pairPhoneLabel';
import { OperateIcon } from '../design-system';
import { canPairPhone, pairPhone, phoneSnapshot, unpairPhone } from '../phone/phoneStore';
import { canConnectLeader, connectLeader, disconnectLeader, leaderConnected } from '../robot/leaderStore';
import type { CommandInputs } from './sceneCommands';

const ic = 'w-4 h-4';

export const INPUT_COMMANDS = ['pair-phone', 'unpair-phone', 'connect-leader', 'disconnect-leader'];

function phoneCommands({ core }: CommandInputs): Command[] {
  if (!canPairPhone()) return [];

  if (phoneSnapshot().status === 'off')
    return [
      {
        id: 'pair-phone',
        group: 'Simulate',
        label: PAIR_PHONE,
        icon: <OperateIcon className={ic} />,
        keywords: 'phone mobile iphone android tilt touch qr code drive steer remote controller',
        run: async () => {
          const reply = await pairPhone();

          if (reply && !reply.ok) core.showToast(reply.message);
        },
      },
    ];

  return [
    {
      id: 'unpair-phone',
      group: 'Simulate',
      label: 'Unpair Phone',
      icon: <OperateIcon className={ic} />,
      keywords: 'phone mobile disconnect stop',
      run: () => void unpairPhone(),
    },
  ];
}

function leaderCommands({ core }: CommandInputs): Command[] {
  const leader = core.studio.robotsBeside(core.workspaceId).find((r) => r.leads?.sceneId === core.scene.sceneId);

  if (leaderConnected())
    return [
      {
        id: 'disconnect-leader',
        group: 'Operate',
        label: 'Disconnect Leader',
        icon: <OperateIcon className={ic} />,
        keywords: 'leader arm teleop follower',
        run: () => void disconnectLeader(),
      },
    ];

  if (!leader?.leads || !canConnectLeader()) return [];

  const input = {
    leader: leader.joints,
    leads: leader.leads,
    follower: { parts: core.parts, joints: core.project.joints ?? [] },
  };

  return [
    {
      id: 'connect-leader',
      group: 'Operate',
      label: 'Connect Leader',
      icon: <OperateIcon className={ic} />,
      keywords: 'leader arm teleop teleoperation follower demonstrations so-101 gello',
      run: async () => {
        const reply = await connectLeader(input);

        if (!reply.ok) core.showToast(reply.message);
      },
    },
  ];
}

export const inputCommands = (inputs: CommandInputs): Command[] => [
  ...phoneCommands(inputs),
  ...leaderCommands(inputs),
];
