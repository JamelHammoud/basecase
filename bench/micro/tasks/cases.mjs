import { allOf } from '../checks.mjs';
import { bomWithin, caseUnchanged, casePasses } from '../caseChecks.mjs';
import { box, union } from '../csg.mjs';
import { component, joint, printed } from '../parts.mjs';

export const WHEELS = {
  32: { id: 'pololu-wheel-32x7', width: 8.6 },
  60: { id: 'pololu-wheel-60x8', width: 11 },
};

const MOTOR = 'component:pololu-micro-metal-gearmotor';
const CASTER = { catalog: 'component:pololu-ball-caster-3-8in', height: 10.07, y: -45 };
const PLATE = [90, 120, 5];
const PLATE_OVER_AXLE = 8;
const MOTOR_INSET = 20;
const WHEEL_GAP = 4;
const GROUP = 'Rover';
const BASE = ['chassis', 'motor-left', 'motor-right', 'caster'];

export const BLOCK_CASE = { goal: 'reach', world: 'block', values: { seconds: 8 } };
export const BLOCK_CASE_ID = 'reach-a-spot-past-a-block';

function wheelJoint(side, { x, axle }) {
  const spinning = joint({
    id: `${side}-wheel`,
    parent: BASE,
    child: [`wheel-${side}`],
    origin: [x, 0, axle],
    axis: [1, 0, 0],
    actuators: [`motor-${side}`],
  });

  delete spinning.range;

  return spinning;
}

export function pololuRover({ wheelMm, cases = [] }) {
  const wheel = WHEELS[wheelMm];
  const axle = wheelMm / 2;
  const plateZ = axle + PLATE_OVER_AXLE;
  const plateBottom = plateZ - PLATE[2] / 2;
  const post = plateBottom - CASTER.height;
  const wheelX = PLATE[0] / 2 + WHEEL_GAP + wheel.width / 2;
  const motorX = PLATE[0] / 2 - MOTOR_INSET;
  const chassis = union(box(PLATE, [0, 0, plateZ]), box([22, 14, post + 0.5], [0, CASTER.y, CASTER.height + post / 2]));
  const at = (side) => ({ x: side === 'left' ? -wheelX : wheelX, axle });
  const part = (spec) => component({ group: GROUP, ...spec });

  return {
    name: 'Rover',
    parts: [
      printed({ id: 'chassis', name: 'Chassis', group: GROUP, solid: chassis }),
      part({
        id: 'motor-left',
        name: 'Left motor',
        catalog: MOTOR,
        position: [-motorX, 0, axle],
        rotation: [0, -90, 0],
      }),
      part({
        id: 'motor-right',
        name: 'Right motor',
        catalog: MOTOR,
        position: [motorX, 0, axle],
        rotation: [0, 90, 0],
      }),
      part({ id: 'wheel-left', name: 'Left wheel', catalog: `component:${wheel.id}`, position: [-wheelX, 0, axle] }),
      part({ id: 'wheel-right', name: 'Right wheel', catalog: `component:${wheel.id}`, position: [wheelX, 0, axle] }),
      part({ id: 'caster', name: 'Caster', catalog: CASTER.catalog, position: [0, CASTER.y, CASTER.height / 2] }),
    ],
    joints: [wheelJoint('left', at('left')), wheelJoint('right', at('right'))],
    cases,
  };
}

export const CASE_TASKS = [
  {
    id: 'D1',
    category: 'cases',
    title: 'Small wheels miss Reach a Spot past a Block',
    instruction: 'Make it pass Reach a Spot past a Block, for about the same cost.',
    fixture: () => pololuRover({ wheelMm: 32, cases: [BLOCK_CASE] }),
    solution: () => pololuRover({ wheelMm: 60 }),
    startBom: true,
    grade: allOf(caseUnchanged(BLOCK_CASE_ID), casePasses(BLOCK_CASE_ID), bomWithin(0.2)),
  },
];
