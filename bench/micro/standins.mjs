import { box, cyl, diff, sphere, union } from './csg.mjs';
import { INSERT_HOLE, STS3215, component, insert, joint, printed, screw } from './parts.mjs';

const hollow = (size, at, wall) =>
  diff(
    box(size, at),
    box(
      size.map((v) => v - 2 * wall),
      at,
    ),
  );

export function effectorCap({ capD = 36 } = {}) {
  const group = 'Left hand';
  const xs = [-8, 8];
  const forearm = diff(box([40, 40, 30], [0, 0, -15]), ...xs.map((x) => cyl(INSERT_HOLE.M3, 6.9, [x, 0, -3.35])));
  const cap = diff(
    sphere(capD),
    box([capD + 2, capD + 2, capD / 2 + 1], [0, 0, -(capD / 2 + 1) / 2]),
    ...xs.flatMap((x) => [cyl(6.5, 14, [x, 0, 11]), cyl(3.4, 6, [x, 0, 2])]),
  );

  return {
    name: 'Hand effector',
    parts: [
      printed({ id: 'forearm', name: 'Forearm', group, solid: forearm }),
      printed({ id: 'effector', name: 'Effector', group, solid: cap, color: '#f59e0b' }),
      ...xs.map((x, i) => insert({ id: `effector-insert-${i + 1}`, top: [x, 0, 0], group })),
      ...xs.map((x, i) => screw({ id: `effector-screw-${i + 1}`, length: 10, seat: [x, 0, 4], group })),
    ],
  };
}

export function headHalves() {
  const group = 'Head';
  const xs = [-20, 20];
  const front = diff(
    union(hollow([60, 30, 50], [0, -15, 150], 3), ...xs.map((x) => cyl(8, 27, [x, -13.5, 150], 'y'))),
    box([54, 4, 44], [0, 1, 150]),
    ...xs.map((x) => cyl(INSERT_HOLE.M3, 6.9, [x, -3.35, 150], 'y')),
  );
  const back = diff(
    union(
      diff(box([60, 30, 50], [0, 15, 150]), box([54, 28, 44], [0, 13, 150])),
      ...xs.map((x) => box([14, 4, 10], [Math.sign(x) * 23, 2, 150])),
    ),
    ...xs.map((x) => cyl(3.4, 6, [x, 2, 150], 'y')),
  );

  return {
    name: 'Head halves',
    parts: [
      printed({ id: 'head-front', name: 'Head front', group, solid: front }),
      printed({ id: 'head-back', name: 'Head back', group, solid: back }),
      ...xs.map((x, i) => insert({ id: `head-insert-${i + 1}`, top: [x, 0, 150], dir: [0, -1, 0], group })),
      ...xs.map((x, i) => screw({ id: `head-screw-${i + 1}`, length: 10, seat: [x, 4, 150], dir: [0, -1, 0], group })),
    ],
  };
}

export function torsoWithArms() {
  const group = 'Torso';
  const zs = [85, 115];
  const sides = [1, -1];
  const shell = diff(
    hollow([80, 50, 80], [0, 0, 100], 3),
    ...sides.flatMap((s) => zs.map((z) => cyl(3.4, 6, [s * 38.5, 0, z], 'x'))),
  );
  const frame = diff(
    box([50, 30, 60], [0, 0, 100]),
    ...sides.flatMap((s) => zs.map((z) => cyl(INSERT_HOLE.M3, 6.9, [s * 21.65, 0, z], 'x'))),
  );
  const fasteners = sides.flatMap((s) =>
    zs.flatMap((z, i) => {
      const side = s > 0 ? 'l' : 'r';
      const dir = [-s, 0, 0];

      return [
        insert({ id: `shell-insert-${side}${i + 1}`, top: [s * 25, 0, z], dir, group }),
        screw({ id: `shell-screw-${side}${i + 1}`, length: 20, seat: [s * 40, 0, z], dir, group }),
      ];
    }),
  );

  return {
    name: 'Torso with arms',
    parts: [
      printed({ id: 'torso-shell', name: 'Torso shell', group, solid: shell }),
      printed({ id: 'torso-frame', name: 'Torso frame', group, solid: frame, color: '#71717a' }),
      ...sides.map((s) =>
        printed({
          id: s > 0 ? 'left-upper-arm' : 'right-upper-arm',
          name: s > 0 ? 'Left upper arm' : 'Right upper arm',
          group: s > 0 ? 'Left arm' : 'Right arm',
          solid: box([24, 30, 60], [s * 56, 0, 100]),
        }),
      ),
      ...fasteners,
    ],
    meta: { shellScrews: fasteners.filter((p) => p.id.startsWith('shell-screw')).map((p) => p.id) },
  };
}

export function serviceTorso({ chargePort = true } = {}) {
  const group = 'Torso';
  const xs = [-12, 12];
  const shell = diff(
    union(hollow([90, 60, 100], [0, 0, 110], 3), ...xs.map((x) => cyl(8, 6, [x, 24, 80], 'y'))),
    ...xs.map((x) => cyl(INSERT_HOLE.M3, 6.9, [x, 23.55, 80], 'y')),
  );
  const parts = [
    printed({ id: 'torso-shell', name: 'Torso shell', group, solid: shell }),
    printed({ id: 'electronics-tray', name: 'Electronics tray', group, solid: box([80, 50, 3], [0, 0, 100]) }),
    printed({
      id: 'battery',
      name: 'Battery',
      group,
      solid: box([70, 28, 25], [0, 0, 74]),
      supply: 'supply:lipo-3s-2200',
      color: '#27272a',
    }),
    component({ id: 'pi', name: 'Raspberry Pi 5', group, catalog: 'component:raspberry-pi-5', position: [0, 0, 112] }),
  ];

  if (!chargePort) return { name: 'Torso electronics', parts };

  return {
    name: 'Torso electronics',
    parts: [
      ...parts,
      printed({
        id: 'charge-port',
        name: 'Charge port plate',
        group,
        solid: diff(box([34, 3, 14], [0, 19.5, 80]), ...xs.map((x) => cyl(3.4, 5, [x, 19.5, 80], 'y'))),
      }),
      ...xs.map((x, i) => insert({ id: `port-insert-${i + 1}`, top: [x, 21, 80], dir: [0, 1, 0], group })),
      ...xs.map((x, i) =>
        screw({ id: `port-screw-${i + 1}`, size: 'M3', length: 8, seat: [x, 18, 80], dir: [0, 1, 0], group }),
      ),
    ],
  };
}

function leg(side, { knee = STS3215 } = {}) {
  const s = side === 'left' ? 1 : -1;
  const x = s * 30;
  const group = side === 'left' ? 'Left leg' : 'Right leg';
  const id = (n) => `${side}-${n}`;
  const rotation = side === 'left' ? [0, 90, 0] : [0, -90, 180];

  return {
    parts: [
      component({
        id: id('hip-servo'),
        name: `${side} hip servo`,
        group,
        catalog: STS3215,
        position: [x, 0, 222],
        rotation,
      }),
      printed({ id: id('thigh'), name: `${side} thigh`, group, solid: box([30, 36, 80], [x, 0, 170]) }),
      component({
        id: id('knee-servo'),
        name: `${side} knee servo`,
        group,
        catalog: knee,
        position: [x, 0, 118],
        rotation,
      }),
      printed({ id: id('shin'), name: `${side} shin`, group, solid: box([28, 34, 80], [x, 0, 60]) }),
      printed({ id: id('foot'), name: `${side} foot`, group, solid: box([50, 90, 12], [x, -10, 6]) }),
    ],
    joints: [
      joint({
        id: id('hip-pitch'),
        parent: ['pelvis'],
        child: [id('thigh'), id('knee-servo'), id('shin'), id('foot')],
        origin: [x, 0, 222],
        actuators: [id('hip-servo')],
        limb: 'leg',
      }),
      joint({
        id: id('knee'),
        parent: [id('thigh'), id('knee-servo')],
        child: [id('shin'), id('foot')],
        origin: [x, 0, 118],
        range: [0, 120],
        actuators: [id('knee-servo')],
        limb: 'leg',
      }),
    ],
  };
}

export function legs({ sides = ['left', 'right'], knee, extras = [], project } = {}) {
  const built = sides.map((side) => leg(side, { knee }));

  return {
    name: 'Legs',
    parts: [
      printed({ id: 'pelvis', name: 'Pelvis', group: 'Pelvis', solid: box([100, 60, 30], [0, 0, 255]) }),
      ...built.flatMap((b) => b.parts),
      ...extras,
    ],
    joints: built.flatMap((b) => b.joints),
    project,
  };
}

export function elbow({ hornScrews = false } = {}) {
  const group = 'Arm';
  const screws = [-6, 6].flatMap((y) =>
    [-6, 6].map((x, i) =>
      screw({
        id: `horn-screw-${y < 0 ? 'a' : 'b'}${i + 1}`,
        size: 'M3',
        length: 6,
        seat: [x, y, 88],
        dir: [0, 0, 1],
        group,
      }),
    ),
  );

  return {
    name: 'Elbow',
    parts: [
      printed({ id: 'upper-arm', name: 'Upper arm', group, solid: box([30, 30, 80], [0, 0, 180]) }),
      component({ id: 'elbow-servo', name: 'Elbow servo', group, catalog: STS3215, position: [0, 0, 112] }),
      printed({ id: 'forearm', name: 'Forearm', group, solid: box([28, 28, 88], [0, 0, 44]) }),
      ...(hornScrews ? screws : []),
    ],
    joints: [
      joint({
        id: 'elbow',
        parent: ['upper-arm', 'elbow-servo'],
        child: ['forearm'],
        origin: [0, 0, 95],
        range: [0, 100],
        actuators: ['elbow-servo'],
        limb: 'arm',
      }),
    ],
  };
}

export function feet({ leftEdited = true, rightEdited = false } = {}) {
  const plain = (x) => box([50, 90, 14], [x, -10, 7]);
  const shaped = (x) => diff(plain(x), cyl(30, 60, [x, -60, 22], 'x'));

  return {
    name: 'Feet',
    parts: [
      printed({ id: 'left-foot', name: 'Left foot', group: 'Left leg', solid: leftEdited ? shaped(30) : plain(30) }),
      printed({
        id: 'right-foot',
        name: 'Right foot',
        group: 'Right leg',
        solid: rightEdited ? shaped(-30) : plain(-30),
      }),
    ],
  };
}

export function craftBlocks(kind) {
  const KINDS = {
    arm: [printed({ id: 'upper-arm', name: 'Upper arm', group: 'Arm', solid: box([32, 32, 110], [0, 0, 155]) })],
    torso: [
      printed({
        id: 'torso-shell',
        name: 'Torso shell',
        group: 'Torso',
        solid: diff(
          union(box([90, 60, 110], [0, 0, 155]), box([94, 10, 8], [0, 0, 180]), box([10, 64, 30], [0, 0, 130])),
          ...[-30, -20, -10, 0, 10, 20, 30].map((x) => box([4, 70, 20], [x, 0, 200])),
        ),
      }),
    ],
    limbs: ['left-thigh', 'right-thigh', 'left-shin', 'right-shin'].map((id, i) =>
      printed({
        id,
        name: id.replace('-', ' '),
        group: 'Legs',
        solid: box([34, 34, 80], [i % 2 ? -30 : 30, 0, i < 2 ? 170 : 80]),
      }),
    ),
  };

  return { name: `Craft ${kind}`, parts: KINDS[kind] };
}
