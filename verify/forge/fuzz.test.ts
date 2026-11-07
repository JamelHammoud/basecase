import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  box,
  fixtureMeasures,
  fixtureTriangles,
  joint,
  type FixtureRobot,
  type JointSpec,
  type P3,
} from '../../src/sim/fixtures/parts';
import { buildMjcf } from '../../src/sim/mjcf';
import { DEFAULT_PROJECT } from '../../src/types/robotics';
import { buildRig } from '../../src/utils/kinematics';

const OUT = path.resolve('verify/out/fuzz');
const COUNT = 200;

function rng(seed: number) {
  let s = seed + 1;

  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;

    return s / 4294967296;
  };
}

const AXES: P3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

function legChain(r: () => number, leg: number, hipY: number, spread: number) {
  const a = (leg / 4) * Math.PI * 2 + r() * 0.3;
  const x = Math.cos(a) * spread;
  const z = Math.sin(a) * spread;
  const links = 2 + Math.floor(r() * 3);
  const length = hipY / links;
  const parts = [];
  const specs: JointSpec[] = [];
  let parent = 'body';
  let y = hipY;
  let parentJoint: string | undefined;

  for (let i = 0; i < links; i++) {
    const name = `l${leg}_${i}`;

    parts.push(box(name, [x, y - length / 2, z], [15 + r() * 15, length, 15 + r() * 15], 20 + r() * 150));
    specs.push({
      id: `j${leg}_${i}`,
      link: [parent, name],
      origin: [x, y, z],
      axis: AXES[Math.floor(r() * 3)],
      effortNm: 0.5 + r() * 6,
      range: [-60 - r() * 60, 60 + r() * 60],
      parentJoint,
      limb: 'leg',
    });
    parent = name;
    parentJoint = `j${leg}_${i}`;
    y -= length;
  }

  return { parts, joints: specs.map(joint) };
}

export function fuzzRobot(seed: number): FixtureRobot {
  const r = rng(seed);
  const legs = 2 + Math.floor(r() * 5);
  const hipY = 60 + r() * 220;
  const spread = 40 + r() * 120;
  const chains = Array.from({ length: legs }, (_, i) => legChain(r, i, hipY, spread));
  const size: P3 = [spread * 2 + 20, 20 + r() * 80, spread * 2 + 20];

  return {
    id: `fuzz-${seed}`,
    parts: [box('body', [0, hipY + size[1] / 2, 0], size, 200 + r() * 3000), ...chains.flatMap((c) => c.parts)],
    joints: chains.flatMap((c) => c.joints),
    expect: { morphology: 'legged', stand: 'n/a', walk: 'n/a' },
  };
}

describe('fuzzed robots', () => {
  it(`emits ${COUNT} models the writer can produce`, () => {
    fs.rmSync(OUT, { recursive: true, force: true });

    for (let seed = 0; seed < COUNT; seed++) {
      const robot = fuzzRobot(seed);
      const model = buildMjcf({
        parts: robot.parts,
        rig: buildRig(robot.joints, robot.parts),
        project: { ...DEFAULT_PROJECT, joints: robot.joints },
        measures: fixtureMeasures(robot.parts),
        partTriangles: fixtureTriangles(robot.parts),
      });
      const dir = path.join(OUT, robot.id);

      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'model.xml'), model.xml);
    }

    expect(fs.readdirSync(OUT)).toHaveLength(COUNT);
  });
});
