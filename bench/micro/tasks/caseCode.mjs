import { controlsExist, noRefusedCalls, noUncaughtErrors, simDoes } from '../caseCodeChecks.mjs';
import { allOf } from '../checks.mjs';
import { codeScene, startConsole, withCode } from '../codeScenes.mjs';
import { SOLUTIONS } from './caseCodeSolutions.mjs';

const JOINT_DRIVE = { needs: 'joint drive' };

const button = (name) => ({ role: 'button', name });

const travelled = (state) => state?.stats?.robots?.[0]?.travelled ?? 0;

const driving = (state) => state?.drive === 'on';

async function canvasIn(io) {
  for (const frame of io.frames) {
    const canvas = frame.locator('canvas');

    if (await canvas.count()) return canvas.first();
  }

  return null;
}

async function draw(io, points) {
  const box = await (await canvasIn(io))?.boundingBox();

  if (!box) return false;

  const at = ([x, y]) => [box.x + box.width * x, box.y + box.height * y];

  await io.page.mouse.move(...at(points[0]));
  await io.page.mouse.down();

  for (const point of points.slice(1)) await io.page.mouse.move(...at(point), { steps: 8 });

  await io.page.mouse.up();

  return true;
}

async function press(io, name) {
  const control = await io.find(button(name));

  if (!control) return false;

  await control.click();

  return true;
}

async function travels(io, act, metres) {
  const before = travelled(await io.sample());

  if (!(await act())) return { pass: false, detail: 'Couldn’t use the controls' };

  const moved = travelled(await io.until(io.sample, (s) => travelled(s) - before > metres, 12000)) - before;

  return { pass: moved > metres, detail: `Travelled ${moved.toFixed(2)} m` };
}

const drawAndGo = (io) =>
  travels(
    io,
    async () =>
      (await draw(io, [
        [0.5, 0.8],
        [0.5, 0.5],
        [0.6, 0.2],
      ])) && press(io, 'Go'),
    0.1,
  );

const throttleUp = (io) =>
  travels(
    io,
    async () => {
      const throttle = await io.find({ role: 'slider', name: 'Throttle' });

      await throttle?.fill('100');

      return !!throttle;
    },
    0.05,
  );

async function danceThenStop(io) {
  if (!(await press(io, 'Dance'))) return { pass: false, detail: 'No Dance' };

  const danced = driving(await io.until(io.sample, driving, 8000));

  await io.sleep(1000);

  if (!(await press(io, 'Stop'))) return { pass: false, detail: 'No Stop' };

  const stopped = !driving(await io.until(io.sample, (s) => !driving(s), 5000));

  return {
    pass: danced && stopped,
    detail: `Dance ${danced ? 'drove' : 'didn’t drive'}, Stop ${stopped ? 'stopped' : 'didn’t stop'}`,
  };
}

async function nextOrderMoves(io) {
  const handAfterPress = async () => {
    await press(io, 'Next Order');
    await io.sleep(3000);

    return (await io.sample())?.effector ?? null;
  };
  const [a, b] = [await handAfterPress(), await handAfterPress()];

  if (!a || !b) return { pass: false, detail: 'The arm’s hand never moved under drive' };

  const moved = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  return { pass: moved > 20, detail: `The hand moved ${moved.toFixed(0)} mm between orders` };
}

async function fenceStops(io) {
  const zone = [
    [0.42, 0.42],
    [0.58, 0.42],
    [0.58, 0.58],
    [0.42, 0.58],
    [0.42, 0.42],
  ];

  if (!(await draw(io, zone)) || !(await press(io, 'Start')))
    return { pass: false, detail: 'Couldn’t draw a zone and start' };

  const went = driving(await io.until(io.sample, driving, 8000));
  const stopped = !driving(await io.until(io.sample, (s) => !driving(s), 20000));

  return {
    pass: went && stopped,
    detail: `${went ? 'Drove' : 'Never drove'}, ${stopped ? 'stopped' : 'never stopped'}`,
  };
}

async function gripCloses(io) {
  const grip = await io.find(button('Grip'));
  const box = await grip?.boundingBox();

  if (!box) return { pass: false, detail: 'No Grip' };

  const finger = (s) => s?.joints?.finger_left?.position ?? 0;

  await io.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await io.page.mouse.down();
  await io.until(io.sample, driving, 10000);
  await io.sleep(1500);

  const held = finger(await io.sample());

  await io.page.mouse.up();
  await io.sleep(1500);

  const moved = Math.abs(held - finger(await io.sample())) * 1000;

  return { pass: moved > 5, detail: `The finger moved ${moved.toFixed(0)} mm between held and let go` };
}

function codeTask({
  id,
  title,
  instruction,
  robot,
  controls,
  does,
  sim,
  needs,
  start = startConsole(),
  heldOut = false,
}) {
  return {
    id,
    category: 'case-code',
    title,
    instruction,
    heldOut,
    controls,
    ...(sim ? { sim } : {}),
    startScene: () => codeScene({ robot, name: 'Playground', console: start }),
    solutionScene: () => codeScene({ robot, name: 'Playground', console: withCode(start, SOLUTIONS[id]) }),
    grade: allOf(noUncaughtErrors(), noRefusedCalls(), controlsExist(controls), simDoes(does, needs ? { needs } : {})),
  };
}

const WRIST_TILE = startConsole({
  panels: [{ id: 'wrist', kind: 'camera', signal: 'camera.wrist_camera' }],
  left: ['wrist'],
});

export const CASE_CODE_TASKS = [
  codeTask({
    id: 'W1',
    title: 'A piano that lifts the hexapod’s legs',
    instruction: 'Make a piano for the hexapod: keys A, S, D, F, G and H each lift one of its legs.',
    robot: 'hexapod',
    controls: ['A', 'S', 'D', 'F', 'G', 'H'].map(button),
    does: 'each key lifts its own leg',
    ...JOINT_DRIVE,
  }),
  codeTask({
    id: 'W2',
    title: 'A drawing pad the rover follows',
    instruction: 'Give me a drawing pad: I draw a path, press Go, and the rover follows it.',
    robot: 'rover',
    controls: [button('Go')],
    does: 'Go drives the rover along the drawn path',
    sim: drawAndGo,
  }),
  codeTask({
    id: 'W3',
    title: 'A cockpit for the quadruped',
    instruction:
      'Build a cockpit for the quadruped: a joystick, a Throttle slider that walks it forward, and a HUD over the canvas with its speed and tilt.',
    robot: 'quadruped',
    controls: [{ role: 'slider', name: 'Throttle' }, { text: /speed/i }, { text: /tilt/i }],
    does: 'the throttle walks it forward',
    sim: throttleUp,
  }),
  codeTask({
    id: 'W4',
    title: 'A puppet with a slider per joint',
    instruction: 'Make the biped a puppet: one slider per joint, laid out on the robot’s silhouette.',
    robot: 'biped',
    heldOut: true,
    controls: ['l_roll', 'l_pitch', 'l_bend', 'l_tilt', 'r_roll', 'r_pitch', 'r_bend', 'r_tilt'].map((name) => ({
      role: 'slider',
      name: new RegExp(name.replace('_', '.?'), 'i'),
    })),
    does: 'each slider moves its joint',
    ...JOINT_DRIVE,
  }),
  codeTask({
    id: 'W5',
    title: 'A dance sequencer that loops',
    instruction:
      'Make a dance sequencer for the biped: a grid of poses by beats, and a Play button that plays it in time and loops.',
    robot: 'biped',
    controls: [button('Play'), { role: 'checkbox', name: /beat|1/i }],
    does: 'the checked poses play on their beats',
    ...JOINT_DRIVE,
  }),
  codeTask({
    id: 'W6',
    title: 'A child’s remote with four big buttons',
    instruction: 'Make a child’s remote for the robot dog: four big buttons named Wave, Dance, Sit and Stop.',
    robot: 'quadruped',
    controls: ['Wave', 'Dance', 'Sit', 'Stop'].map(button),
    does: 'Dance moves it and Stop stops it',
    sim: danceThenStop,
  }),
  codeTask({
    id: 'W7',
    title: 'A pick-station dashboard',
    instruction:
      'Make a pick-station dashboard: an order queue, and a Next Order button that moves the arm to the next order.',
    robot: 'arm',
    heldOut: true,
    controls: [button('Next Order'), { role: 'list', name: /order/i }],
    does: 'Next Order moves the arm’s hand',
    sim: nextOrderMoves,
  }),
  codeTask({
    id: 'W8',
    title: 'A bench test with a CSV',
    instruction: 'Make a bench test: sweep a chosen joint, plot effort against angle, and offer a CSV download.',
    robot: 'smallArm',
    controls: [{ role: 'combobox', name: /joint/i }, button('Sweep'), { role: 'button', name: /csv/i }],
    does: 'Sweep moves the chosen joint through its range',
    ...JOINT_DRIVE,
  }),
  codeTask({
    id: 'W9',
    title: 'A safety fence that stops the rover',
    instruction:
      'Make a safety fence: I draw a zone and press Start, and the rover stops and the app turns red when it leaves the zone.',
    robot: 'rover',
    heldOut: true,
    controls: [button('Start')],
    does: 'the rover stops when it leaves the zone',
    sim: fenceStops,
  }),
  codeTask({
    id: 'W10',
    title: 'Two-player tug-of-war',
    instruction:
      'Make two-player tug-of-war: two robots in one Case, one on WASD and one on the arrow keys, with a rope score.',
    robot: 'rover',
    controls: [{ text: /score/i }],
    does: 'each player drives their own robot',
    needs: 'slot drive',
  }),
  codeTask({
    id: 'W11',
    title: 'An SO-101 teleop page with a gripper trigger',
    instruction: 'Make a teleop page for the arm: an on-screen Grip trigger next to its wrist-camera tile.',
    robot: 'wristCameraArm',
    start: WRIST_TILE,
    controls: [button('Grip')],
    does: 'holding Grip closes the gripper',
    sim: gripCloses,
  }),
  codeTask({
    id: 'W12',
    title: 'A G1 camera teleop page',
    instruction: 'Teleop my G1 from my Mac’s camera, with a Start button on the page.',
    robot: 'g1',
    start: startConsole({ input: ['camera'] }),
    controls: [button('Start')],
    does: 'your arms drive the G1’s arms',
    needs: 'live camera',
  }),
  codeTask({
    id: 'W13',
    title: 'A metronome the biped nods to',
    instruction: 'Make a metronome with a Tempo slider and a Start button, and the biped nods on every beat.',
    robot: 'biped',
    heldOut: true,
    controls: [{ role: 'slider', name: 'Tempo' }, button('Start')],
    does: 'the biped nods on each beat',
    ...JOINT_DRIVE,
  }),
];
