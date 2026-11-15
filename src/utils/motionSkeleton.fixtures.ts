interface Bone {
  name: string;
  offset: [number, number, number];
  axes: string[];
  children?: Bone[];
  end?: [number, number, number];
}

function hierarchy(bone: Bone, root = true): string {
  const channels = root ? ['Xposition', 'Yposition', 'Zposition', ...bone.axes] : bone.axes;

  return `${root ? 'ROOT' : 'JOINT'} ${bone.name}\n{\nOFFSET ${bone.offset.join(' ')}\nCHANNELS ${channels.length} ${channels.join(' ')}\n${(bone.children ?? []).map((child) => hierarchy(child, false)).join('\n')}\n${bone.end ? `End Site\n{\nOFFSET ${bone.end.join(' ')}\n}` : ''}\n}`;
}

function bvh(root: Bone, rows: number[][], frameTime = 0.1): string {
  return `HIERARCHY\n${hierarchy(root)}\nMOTION\nFrames: ${rows.length}\nFrame Time: ${frameTime}\n${rows.map((row) => row.join(' ')).join('\n')}\n`;
}

export function planarBvh(locked = false, frameTime = 0.1): string {
  const angles = [0, 90, 180, -90];
  const rows = angles.flatMap((a) => angles.flatMap((b) => angles.map((c) => [0, 0, 0, a, locked ? 0 : b, c])));
  const tip: Bone = { name: 'Tool', offset: [60, 0, 0], axes: [] };
  const wrist: Bone = { name: 'Wrist', offset: [80, 0, 0], axes: ['Zrotation'], children: [tip] };
  const elbow: Bone = { name: 'Elbow', offset: [100, 0, 0], axes: ['Zrotation'], children: [wrist] };

  return bvh({ name: 'Base', offset: [0, 0, 0], axes: ['Zrotation'], children: [elbow] }, rows, frameTime);
}

export function panTiltBvh(rotated = false): string {
  const rows = [0, 30, -30, 60, -60].flatMap((pan) => [0, 30, -30].map((tilt) => [0, 0, 0, pan, tilt]));

  if (rotated) rows[0] = [0, 0, 0, 17, 13];

  return bvh(
    {
      name: 'Head',
      offset: [0, 0, 0],
      axes: ['Yrotation', 'Xrotation'],
      end: [0, 0, 100],
    },
    rows,
  );
}

export function waveBvh(): string {
  const right: Bone = {
    name: 'RightArm',
    offset: [-18, 35, 0],
    axes: ['Zrotation', 'Yrotation'],
    children: [
      {
        name: 'RightForeArm',
        offset: [-28, 0, 0],
        axes: ['Zrotation'],
        children: [{ name: 'RightHand', offset: [-25, 0, 0], axes: [], end: [-8, 0, 0] }],
      },
    ],
  };
  const root: Bone = {
    name: 'Hips',
    offset: [0, 0, 0],
    axes: [],
    children: [
      right,
      { name: 'Head', offset: [0, 75, 0], axes: [] },
      { name: 'LeftFoot', offset: [10, -90, 0], axes: [] },
      { name: 'RightFoot', offset: [-10, -90, 0], axes: [] },
    ],
  };
  const rows = Array.from({ length: 25 }, (_, frame) => {
    const phase = (frame * Math.PI) / 12;

    return [0, 0, 0, -65 + 25 * Math.sin(phase), 20 * Math.sin(phase * 2), -65 + 40 * Math.cos(phase)];
  });

  return bvh(root, rows);
}

export function quadrupedBvh(): string {
  const legs: Bone[] = ['FrontLeft', 'FrontRight', 'RearLeft', 'RearRight'].map((name, index) => ({
    name: `${name}Leg`,
    offset: [index % 2 ? -50 : 50, 0, index < 2 ? 60 : -60],
    axes: ['Xrotation'],
    children: [
      {
        name: `${name}Knee`,
        offset: [0, -100, 0],
        axes: ['Xrotation'],
        children: [{ name: `${name}Foot`, offset: [0, -100, 0], axes: [] }],
      },
    ],
  }));
  const rows = [0, 30, -30].flatMap((hip) => [0, 60, 120].map((knee) => [0, 0, 0, ...legs.flatMap(() => [hip, knee])]));

  return bvh({ name: 'Body', offset: [0, 0, 0], axes: [], children: legs }, rows);
}

export function sharedTorsoBvh(): string {
  const children: Bone[] = [-1, 1].map((side) => ({
    name: side < 0 ? 'RightArm' : 'LeftArm',
    offset: [side * 100, 0, 0],
    axes: ['Xrotation'],
    children: [
      {
        name: side < 0 ? 'RightHand' : 'LeftHand',
        offset: [0, 0, 100],
        axes: [],
      },
    ],
  }));
  const rows = [0, 40, -40].flatMap((pan) => [0, 30, -30].map((tilt) => [0, 0, 0, pan, tilt, tilt]));

  return bvh({ name: 'Torso', offset: [0, 0, 0], axes: ['Yrotation'], children }, rows);
}

export function obliqueAxisBvh(): string {
  const orientation = [10.698184177142734, 13.434452896972, 103.03173990503484];
  const arm: Bone = { name: 'Arm', offset: [0, 0, 0], axes: ['Yrotation'], end: [100, 100, 0] };
  const root: Bone = {
    name: 'Base',
    offset: [0, 0, 0],
    axes: ['Xrotation', 'Yrotation', 'Zrotation'],
    children: [arm],
  };

  return bvh(
    root,
    [0, 60, -60].map((angle) => [0, 0, 0, ...orientation, angle]),
  );
}

export function wrappedHingeBvh(): string {
  const root: Bone = { name: 'Base', offset: [0, 0, 0], axes: ['Zrotation'], end: [100, 0, 0] };

  return bvh(
    root,
    [170, 175, 180, -175, -170].map((angle) => [0, 0, 0, angle]),
  );
}
