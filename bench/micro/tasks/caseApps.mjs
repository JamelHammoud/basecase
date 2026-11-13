import { consoleHas, rightRobot, robotFits, runsInSim } from '../caseAppChecks.mjs';
import { allOf } from '../checks.mjs';
import { pololuRover } from './cases.mjs';

const EMPTY = () => ({ name: 'Empty', parts: [], joints: [] });

const ROVER_APP = {
  input: ['gamepad'],
  panels: [
    { id: 'front', kind: 'camera', signal: 'camera.*' },
    { id: 'tries', kind: 'list', of: 'tries' },
  ],
  layout: { areas: [{ size: 480, panels: ['front'] }, { canvas: true }, { size: 300, panels: ['tries'] }] },
};

function caseApp({ id, title, instruction, robot, count, want, fixture = EMPTY, heldOut = false, solution }) {
  return {
    id,
    category: 'case-apps',
    title,
    instruction,
    heldOut,
    fixture,
    ...(solution ? { solution } : {}),
    grade: allOf(rightRobot(robot, count), consoleHas(want), robotFits(), runsInSim()),
  };
}

export const CASE_APP_TASKS = [
  caseApp({
    id: 'E1',
    title: 'Teleop a G1’s arms from the Mac’s camera',
    instruction: 'Teleop my G1 over ethernet, mirror my arms from my Mac’s camera.',
    robot: 'g1',
    want: { inputs: ['camera'], panels: ['camera'] },
  }),
  caseApp({
    id: 'E2',
    title: 'Puppet a desktop arm with a hand pose',
    instruction: 'Let me puppet a desktop arm with my hand, from the camera.',
    robot: 'arm',
    want: { inputs: ['camera'], panels: ['camera'] },
  }),
  caseApp({
    id: 'E3',
    title: 'Drive a rover with a gamepad, watching its front camera',
    instruction: 'Drive this rover with a gamepad while I watch its front camera.',
    robot: 'rover',
    fixture: () => pololuRover({ wheelMm: 60 }),
    solution: () => pololuRover({ wheelMm: 60, cases: [{ goal: 'reach', world: 'floor', console: ROVER_APP }] }),
    want: { inputs: ['gamepad'], panels: ['camera'] },
  }),
  caseApp({
    id: 'E4',
    title: 'Drive an SO-101 from a leader arm and record a dataset',
    instruction: 'Drive an SO-101 from a generated leader arm and record a dataset.',
    robot: 'so101',
    want: { inputs: ['leader-arm'], panels: ['list'] },
  }),
  caseApp({
    id: 'E5',
    title: 'Steer a quadruped by tilting a phone',
    instruction: 'Steer a quadruped by tilting my phone.',
    robot: 'quadruped',
    want: { inputs: ['phone'] },
  }),
  caseApp({
    id: 'E6',
    title: 'A pan-tilt camera that keeps a face centered',
    instruction: 'Make a pan-tilt camera that keeps my face centered.',
    robot: 'panTilt',
    heldOut: true,
    want: { inputs: ['camera'], panels: ['camera'] },
  }),
  caseApp({
    id: 'E7',
    title: 'A robot dog that sits on “sit”',
    instruction: 'Make a robot dog that sits when I say “sit”.',
    robot: 'quadruped',
    heldOut: true,
    want: { inputs: ['voice'] },
  }),
  caseApp({
    id: 'E8',
    title: 'A sorting cell with a trained policy and a count',
    instruction: 'Make a sorting cell where a trained policy picks blocks while a panel counts them.',
    robot: 'arm',
    want: { inputs: ['policy'], panels: ['value'], signals: ['counter'] },
  }),
  caseApp({
    id: 'E9',
    title: 'Two arms hand off a part from one screen',
    instruction: 'Have two robot arms hand off a part, run from one screen.',
    robot: 'arm',
    count: 2,
    want: { inputs: ['keys|gamepad'] },
  }),
  caseApp({
    id: 'E10',
    title: 'A hexapod dancing to a MIDI track',
    instruction: 'Make a hexapod dance in time to a MIDI track.',
    robot: 'hexapod',
    heldOut: true,
    want: { inputs: ['midi'] },
  }),
  caseApp({
    id: 'E11',
    title: 'A scored, timed block game with a teleoperated arm',
    instruction: 'Make a game: knock the blocks over with an arm I teleoperate, against a timer, scored.',
    robot: 'arm',
    want: { inputs: ['keys|gamepad'], panels: ['value'], signals: ['timer', 'score'] },
  }),
  caseApp({
    id: 'E12',
    title: 'Wave at the camera and the robot waves back',
    instruction: 'When I wave at the camera, the robot waves back.',
    robot: 'any',
    heldOut: true,
    want: { inputs: ['camera'], panels: ['camera'] },
  }),
];
