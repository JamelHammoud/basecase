import { describe, expect, it } from 'vitest';
import type { RobotJoint } from '../types/robotics';
import { joint } from '../utils/engineering.fixtures';
import { updatedJointIds } from './onshapeJointIds';

type Input = Parameters<typeof updatedJointIds>[0];

function matchingBefore(fresh: RobotJoint, mine: RobotJoint[], sceneIdOf: Map<string, string>) {
  const mate = fresh.onshape?.mate ?? '';
  const exact = mine.filter((j) => j.onshape!.mate === mate);
  const candidates = exact.length ? exact : mine.filter((j) => j.onshape!.mate === mate.split('/').at(-1));
  const children = new Set(fresh.child.map((id) => sceneIdOf.get(id)));

  return candidates.find((j) => j.child.some((id) => children.has(id)));
}

function idsBefore({ joints, fresh, mine, sceneIdOf }: Input): Map<string, string> {
  const taken = new Set(joints.map((j) => j.id));
  const remaining = new Set(mine);
  const matches = new Map<string, RobotJoint>();

  for (const f of fresh) {
    const matched = matchingBefore(f, [...remaining], sceneIdOf);

    if (!matched) continue;

    matches.set(f.id, matched);
    remaining.delete(matched);
  }

  return new Map(
    fresh.map((f) => {
      const exact = [...remaining].filter((j) => j.onshape!.mate === f.onshape?.mate);
      const matched = matches.get(f.id) ?? (exact.length === 1 ? exact[0] : undefined);

      if (matched) remaining.delete(matched);

      if (matched) return [f.id, matched.id];

      let n = 1;
      const idOf = () => (n === 1 ? f.id : `${f.id}_${n}`);

      while (taken.has(idOf())) n++;

      taken.add(idOf());

      return [f.id, idOf()];
    }),
  );
}

const mated = (id: string, mate: string, child: string[] = []) => joint(id, { onshape: { mate }, child });

function generated(seed: number): Input {
  const mates = ['', 'root', 'left/knee', 'right/knee', 'knee', '__proto__', 'root/'];
  const mine = Array.from({ length: seed % 19 }, (_, i) =>
    mated(`old-${i}`, mates[(seed + i * 3) % mates.length], [`part-${(i * 7 + seed) % 11}`]),
  );
  const fresh = Array.from({ length: seed % 23 }, (_, i) =>
    mated(`fresh-${i % 17}`, mates[(seed * 3 + i) % mates.length], [`new-${(i * 3 + seed) % 13}`]),
  );

  if (mine.length) mine.push(mine[0]);

  if (fresh.length && seed % 3 === 0) fresh[0] = joint(fresh[0].id, {});

  return {
    joints: [...mine, joint('fresh-0', {}), joint('fresh-0_2', {})],
    mine,
    fresh,
    sceneIdOf: new Map(Array.from({ length: 11 }, (_, i) => [`new-${i}`, `part-${(i + seed) % 11}`])),
  };
}

function compare(input: Input) {
  const before = structuredClone(input);
  const expected = idsBefore(input);

  expect(updatedJointIds(input)).toEqual(expected);
  expect(input).toEqual(before);
}

describe('Onshape joint identity matching', () => {
  it('matches the previous two-pass reservation across mixed mate identities and later edits', () => {
    for (let seed = 0; seed < 160; seed++) {
      const input = generated(seed);

      compare(input);
      input.mine.reverse();
      input.fresh.reverse();
      input.sceneIdOf.set('new-0', 'part-0');

      for (const j of input.mine) j.onshape!.mate = `edited/${j.onshape!.mate}`;

      compare(input);
    }
  });

  it('reserves a legacy child match before the root mate fallback, regardless of incoming order', () => {
    const legacy = mated('old-knee', 'feature', ['knee-part']);
    const root = mated('new-root', 'feature', ['new-base']);
    const knee = mated('new-knee', 'leg/feature', ['new-knee-part']);
    const input = {
      joints: [legacy],
      mine: [legacy],
      fresh: [root, knee],
      sceneIdOf: new Map([['new-knee-part', 'knee-part']]),
    };

    expect(updatedJointIds(input)).toEqual(
      new Map([
        ['new-root', 'new-root'],
        ['new-knee', 'old-knee'],
      ]),
    );
    input.fresh.reverse();
    compare(input);
  });

  it('keeps exact-mate priority, first child ties and the unique remaining fallback', () => {
    const mine = [
      mated('exact', 'leg/feature', ['other']),
      mated('bare', 'feature', ['part']),
      mated('first', 'tie', ['part']),
      mated('second', 'tie', ['part']),
    ];
    const input = {
      joints: mine,
      mine,
      fresh: [mated('scoped', 'leg/feature', ['new-part']), mated('a', 'tie', ['new-part']), mated('b', 'tie')],
      sceneIdOf: new Map([['new-part', 'part']]),
    };

    expect(updatedJointIds(input)).toEqual(
      new Map([
        ['scoped', 'exact'],
        ['a', 'first'],
        ['b', 'second'],
      ]),
    );
    compare(input);
  });

  it('accepts frozen inputs and returns independent maps rebuilt from current mate and child data', () => {
    const old = mated('old', 'feature', ['part']);
    const fresh = mated('fresh', 'feature', ['new']);
    const input = { joints: [old], mine: [old], fresh: [fresh], sceneIdOf: new Map([['new', 'part']]) };

    for (const j of [old, fresh]) {
      Object.freeze(j.child);
      Object.freeze(j.onshape);
      Object.freeze(j);
    }

    Object.freeze(input.joints);
    Object.freeze(input.mine);
    Object.freeze(input.fresh);
    compare(input);

    const first = updatedJointIds(input);

    first.set('fresh', 'local-change');
    expect(updatedJointIds(input).get('fresh')).toBe('old');
    expect(updatedJointIds({ ...input, mine: [] }).get('fresh')).toBe('fresh');
  });

  it.each([300, 600])('indexes mate identities for %i joints in both reservation passes', (size) => {
    for (const childMatches of [true, false]) {
      let reads = 0;
      const mine = Array.from({ length: size }, (_, i) =>
        joint(`old-${i}`, {
          child: [`part-${i}`],
          onshape: {
            get mate() {
              reads++;

              return `mate-${i}`;
            },
          },
        }),
      );
      const fresh = Array.from({ length: size }, (_, i) => mated(`fresh-${i}`, `mate-${i}`, [`new-${i}`]));
      const input = {
        joints: mine,
        mine,
        fresh,
        sceneIdOf: childMatches ? new Map(fresh.map((j, i) => [j.child[0], `part-${i}`])) : new Map<string, string>(),
      };
      const before = idsBefore(input);
      const beforeReads = reads;

      reads = 0;

      const after = updatedJointIds(input);

      expect(reads).toBe(size * (childMatches ? 3 : 2));
      expect(beforeReads).toBe(childMatches ? (size * (size + 1)) / 2 : (3 * size * size + size) / 2);
      expect(after).toEqual(before);
    }
  });
});
