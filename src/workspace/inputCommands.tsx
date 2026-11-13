import type { Command } from '../components/CommandPalette';
import { PAIR_PHONE } from '../components/phone/pairPhoneLabel';
import { OperateIcon } from '../design-system';
import { canPairPhone, pairPhone, phoneSnapshot, unpairPhone } from '../phone/phoneStore';
import type { CommandInputs } from './sceneCommands';

const ic = 'w-4 h-4';

export const INPUT_COMMANDS = ['pair-phone', 'unpair-phone'];

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

export const inputCommands = phoneCommands;
