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
  parts: [servo, box('arm', [34, 90, 0], [18, 50, 18], 25)],
  project: {
    ...DEFAULT_PROJECT,
    labelParts: false,
    joints: [
      {
        ...joint({ id: 'shoulder', link: [servo.id, 'arm'], origin: [34, 55, 0], axis: [1, 0, 0], effortNm: 1.9 }),
        name: 'Shoulder',
        actuators: [servo.id],
      },
    ],
  },
});
