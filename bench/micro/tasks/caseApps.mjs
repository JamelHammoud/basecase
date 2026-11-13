import { allOf } from '../checks.mjs';
import {
  cameraOf,
  consoleCheck,
  emptyScene,
  fitsCheck,
  fixtureScene,
  kept,
  listOf,
  madeWith,
  named,
  robotCheck,
  runsCheck,
  showsSignal,
} from '../caseApps.mjs';

const operator = { label: 'the operator camera', test: cameraOf('camera.operator'), needs: 'camera' };
const robotCamera = (name) => ({ label: `the ${name.replace('_', ' ')}`, test: cameraOf(`camera.${name}`) });
const tries = { label: 'tries', test: listOf('tries') };
const timer = { label: 'a timer', test: showsSignal('timer') };
const score = { label: 'a score', test: showsSignal('score') };
const counter = { label: 'a counter', test: showsSignal('counter') };

const G1 = named('a Unitree G1', /Unitree G1/i);
const SO101 = named('an SO-101 arm', /SO-?101/i);
const QUADRUPED = named('a quadruped', /Go2|Go1|B2|ANYmal|Spot/i);
const HUMANOID = named('a humanoid', /G1|H1|Apollo|Booster|Berkeley|OP3|Duck/i);

const panTilt = madeWith(
  'a pan-tilt camera',
  (scene) =>
    (scene?.parts ?? []).some((p) => p.category === 'perception') && (scene?.project?.joints ?? []).length >= 2,
);

const caseApp = ({ robot, inputs, panels }) =>
  allOf(robotCheck(robot), consoleCheck({ inputs, panels }), fitsCheck(), runsCheck());

const task = ({ id, title, instruction, record, heldOut, ...grade }) => ({
  id,
  category: 'case-app',
  title,
  instruction,
  record,
  ...(heldOut ? { heldOut } : {}),
  grade: caseApp(grade),
});

export const CASE_APP_TASKS = [
  task({
    id: 'E1',
    title: 'G1 arms from the Mac’s camera',
    instruction:
      'Agent, I want to teleop my G1, plugged in over ethernet. I want to use my mac camera when I move my arms it records the positions and applies it to the robot in realtime',
    record: emptyScene(),
    robot: G1,
    inputs: ['camera'],
    panels: [operator],
  }),
  task({
    id: 'E2',
    title: 'Puppet a desktop arm',
    instruction: 'Let me puppet an SO-101 desktop arm with my hand pose.',
    record: emptyScene(),
    robot: SO101,
    inputs: ['camera'],
    panels: [operator],
  }),
  task({
    id: 'E3',
    title: 'Rover on a gamepad',
    instruction: 'Drive this rover with a gamepad while I watch its front camera.',
    record: fixtureScene('rover-diff', { camera: true }),
    robot: kept('the rover'),
    inputs: ['gamepad'],
    panels: [robotCamera('front_camera')],
  }),
  task({
    id: 'E4',
    title: 'SO-101 from a leader arm',
    instruction: 'Drive an SO-101 from a leader arm you generate for it, and record a dataset.',
    record: emptyScene(),
    robot: SO101,
    inputs: ['leader-arm'],
    panels: [tries],
  }),
  task({
    id: 'E5',
    title: 'Quadruped by phone tilt',
    heldOut: true,
    instruction: 'Steer a Unitree Go2 by tilting my phone.',
    record: emptyScene(),
    robot: QUADRUPED,
    inputs: ['phone'],
    panels: [],
  }),
  task({
    id: 'E6',
    title: 'Face-tracking pan-tilt',
    instruction: 'Make a pan-tilt camera that keeps my face centered.',
    record: emptyScene(),
    robot: panTilt,
    inputs: ['camera'],
    panels: [operator],
  }),
  task({
    id: 'E7',
    title: 'Dog sits on “sit”',
    instruction: 'A Unitree Go2 that sits when I say “sit”.',
    record: emptyScene(),
    robot: QUADRUPED,
    inputs: ['voice'],
    panels: [],
  }),
  task({
    id: 'E8',
    title: 'Sorting cell',
    heldOut: true,
    instruction: 'A sorting cell: a trained policy picks blocks with this arm while a panel counts them.',
    record: fixtureScene('arm-6dof', { camera: true }),
    robot: kept('the arm'),
    inputs: ['policy'],
    panels: [counter],
  }),
  task({
    id: 'E9',
    title: 'Two-arm hand-off',
    instruction: 'Two arms handing off a part, run from one place.',
    record: fixtureScene('arm-6dof'),
    robot: kept('the arm'),
    inputs: [['keys', 'gamepad', 'policy']],
    panels: [tries],
  }),
  task({
    id: 'E10',
    title: 'Hexapod to MIDI',
    heldOut: true,
    instruction: 'Make this hexapod dance in time to a MIDI track.',
    record: fixtureScene('hexapod'),
    robot: kept('the hexapod'),
    inputs: ['midi'],
    panels: [],
  }),
  task({
    id: 'E11',
    title: 'Block game',
    instruction: 'A game: knock the blocks over with this arm, teleoperated with the keys, against a timer, scored.',
    record: fixtureScene('arm-6dof'),
    robot: kept('the arm'),
    inputs: [['keys', 'gamepad']],
    panels: [timer, score],
  }),
  task({
    id: 'E12',
    title: 'Wave back',
    heldOut: true,
    instruction: 'When I wave at the camera, a Unitree G1 waves back.',
    record: emptyScene(),
    robot: HUMANOID,
    inputs: ['camera'],
    panels: [operator],
  }),
];
