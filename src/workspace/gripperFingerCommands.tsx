import type { Command } from '../components/CommandPalette';
import { RulerIcon, RunIcon, StopIcon } from '../design-system';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { CommandInputs } from './sceneCommands';

export function gripperFingerCommands({ actions }: CommandInputs): Command[] {
  if (IS_WEB_DEMO) return [];

  const fingers = actions.fingers;

  if (fingers.busy)
    return [
      {
        id: 'cancel-fingers',
        group: 'Scene',
        label: 'Cancel',
        icon: <StopIcon />,
        keywords: 'finger generation',
        run: fingers.cancel,
      },
    ];

  return [
    ...(fingers.canGenerate
      ? [
          {
            id: 'flat-fingers',
            group: 'Scene',
            label: 'Make Flat Fingers',
            icon: <RulerIcon />,
            keywords: 'gripper replacement object',
            run: () => void fingers.generate('flat'),
          },
          {
            id: 'v-fingers',
            group: 'Scene',
            label: 'Make V Fingers',
            icon: <RulerIcon />,
            keywords: 'gripper replacement cylinder object',
            run: () => void fingers.generate('v'),
          },
        ]
      : []),
    ...(fingers.canTest
      ? [
          {
            id: 'test-grasp',
            group: 'Simulate',
            label: 'Test Grasp',
            icon: <RunIcon />,
            keywords: 'pick selected object gripper',
            run: fingers.test,
          },
        ]
      : []),
  ];
}
