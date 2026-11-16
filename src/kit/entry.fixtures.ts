import { componentSize } from '../data/components';
import { box, joint } from '../sim/fixtures/parts';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';

const servo: ScenePart = {
  ...box('shoulder-servo', [34, 40, 0], [27, 46, 25], 55),
  kind: 'component',
  name: 'Shoulder servo',
  componentId: 'feetech-sts3215',
  componentVariant: 'c001',
  dimensions: componentSize('feetech-sts3215'),
};

export const kitArmScene = () => ({
  name: 'Kit arm',
  parts: [box('base', [0, 10, 0], [70, 20, 60], 50), box('arm', [0, 65, 0], [18, 70, 18], 25), servo],
  project: {
    ...DEFAULT_PROJECT,
    labelParts: false,
    joints: [
      {
        ...joint({ id: 'shoulder', link: ['base', 'arm'], origin: [0, 30, 0], axis: [1, 0, 0], effortNm: 1.9 }),
        name: 'Shoulder',
        actuators: [servo.id],
      },
    ],
  },
});
