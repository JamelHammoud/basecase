import { allOf, hingesOn, untouched } from '../checks.mjs';
import { box, cyl, diff, union } from '../csg.mjs';
import { turnZ } from '../imported.mjs';
import { joint } from '../parts.mjs';

const TURN_DEG = 30;
const SHOULDER_Z = 48;
const ELBOW_Z = 148;
const BORE = 8.4;
const SHAFT = 8;

const base = diff(
  union(box([60, 60, 20], [0, 0, 10]), box([20, 40, 40], [0, 0, 40])),
  cyl(BORE, 42, [0, 0, SHOULDER_Z], 'y'),
);
const upperArm = diff(
  union(box([16, 10, 116], [0, 25.5, 98]), cyl(SHAFT, 47, [0, 2.5, SHOULDER_Z], 'y')),
  cyl(BORE, 12, [0, 25.5, ELBOW_Z], 'y'),
);
const forearm = union(box([16, 10, 100], [0, 36, 190]), cyl(SHAFT, 12, [0, 25.5, ELBOW_Z], 'y'));

const turned = (v) => turnZ(TURN_DEG, v);

export const ARM_HINGES = [
  { id: 'shoulder', axis: turned([0, 1, 0]), origin: turned([0, 0, SHOULDER_Z]) },
  { id: 'elbow', axis: turned([0, 1, 0]), origin: turned([0, 25.5, ELBOW_Z]) },
];

const BODIES = ['arm-base', 'arm-upper', 'arm-fore'];

export function importedArm({ rigged = false } = {}) {
  const [shoulder, elbow] = ARM_HINGES;

  return {
    name: 'Imported arm',
    parts: [],
    imported: {
      file: 'two-link-arm.step',
      turnDeg: TURN_DEG,
      parts: [
        { id: 'arm-base', name: 'two-link-arm 1', solid: base },
        { id: 'arm-upper', name: 'two-link-arm 2', solid: upperArm },
        { id: 'arm-fore', name: 'two-link-arm 3', solid: forearm },
      ],
    },
    joints: rigged
      ? [
          joint({ ...shoulder, parent: ['arm-base'], child: ['arm-upper'] }),
          joint({ ...elbow, parent: ['arm-upper'], child: ['arm-fore'] }),
        ]
      : [],
  };
}

export const RIG_TASKS = [
  {
    id: 'R1',
    category: 'rigging',
    title: 'Rig an imported arm with no joints',
    instruction: 'This arm is a STEP import with no joints. Make it a robot, without changing the parts.',
    fixture: () => importedArm(),
    solution: () => importedArm({ rigged: true }),
    grade: allOf(hingesOn(ARM_HINGES, { maxDeg: 2, maxMm: 2 }), untouched(BODIES)),
  },
];
