import { describe, expect, it } from 'vitest';
import { bvhRotations } from './mocapChannels';
import { parseBvh } from './mocap';
import { panTiltBvh, planarBvh } from './motionSkeleton.fixtures';

const hierarchy = `HIERARCHY
ROOT Hip
CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
JOINT Hand
CHANNELS 4 Yrotation Zposition Xrotation Zrotation
JOINT Still
CHANNELS 3 Xposition Yposition Zposition
JOINT Hip
CHANNELS 1 Xrotation
MOTION
Frames: 2
Frame Time: 0.5
`;

const entries = (sample: ReturnType<typeof bvhRotations>, time: number) => [...sample(time)];

describe('BVH rotation channel groups', () => {
  it('keeps bone and axis order, repeated names and translation offsets across sampled frames', () => {
    const sample = bvhRotations(
      `${hierarchy}1 2 3 40 50 60 70 8 90 100 11 12 13 140
15 16 17 -180 -0 Infinity NaN 22 -90 240 25 26 27 -300`,
      0.5,
    );

    expect(entries(sample, 0)).toEqual([
      [
        'Hip',
        [
          { axis: 'Z', degrees: 40 },
          { axis: 'X', degrees: 50 },
          { axis: 'Y', degrees: 60 },
          { axis: 'X', degrees: 140 },
        ],
      ],
      [
        'Hand',
        [
          { axis: 'Y', degrees: 70 },
          { axis: 'X', degrees: 90 },
          { axis: 'Z', degrees: 100 },
        ],
      ],
    ]);
    expect(entries(sample, 0.5)).toEqual([
      [
        'Hip',
        [
          { axis: 'Z', degrees: -180 },
          { axis: 'X', degrees: -0 },
          { axis: 'Y', degrees: Infinity },
          { axis: 'X', degrees: -300 },
        ],
      ],
      [
        'Hand',
        [
          { axis: 'Y', degrees: NaN },
          { axis: 'X', degrees: -90 },
          { axis: 'Z', degrees: 240 },
        ],
      ],
    ]);
    expect(entries(sample, -10)).toEqual(entries(sample, 0));
    expect(entries(sample, 0.249)).toEqual(entries(sample, 0));
    expect(entries(sample, 0.25)).toEqual(entries(sample, 0.5));
    expect(entries(sample, 10)).toEqual(entries(sample, 0.5));
  });

  it('returns independent maps, lists and rotations without retaining sampled edits', () => {
    const text = `${hierarchy}1 2 3 4 5 6 7 8 9 10 11 12 13 14`;
    const sample = bvhRotations(text, 0.5);
    const first = sample(0);
    const expected = entries(sample, 0);

    first.get('Hip')![0].degrees = 900;
    first.get('Hand')!.reverse();
    first.delete('Hand');
    expect(entries(sample, 0)).toEqual(expected);
    expect(entries(bvhRotations(text.replace('4 5 6', '40 50 60'), 0.5), 0)).not.toEqual(expected);
    expect(entries(sample, 0)).toEqual(expected);
  });

  it('keeps missing rotation values as NaN and omits bones without rotation channels', () => {
    const sample = bvhRotations(`${hierarchy}1 2 3 4`, 0.5);
    const values = sample(0);

    expect([...values.keys()]).toEqual(['Hip', 'Hand']);
    expect(values.get('Hip')!.map((value) => value.degrees)).toEqual([4, NaN, NaN, NaN]);
    expect(values.get('Hand')!.map((value) => value.degrees)).toEqual([NaN, NaN, NaN]);
    expect([...sample(NaN).values()].flat().every((value) => Number.isNaN(value.degrees))).toBe(true);
    expect(entries(bvhRotations('HIERARCHY\nROOT Still\nCHANNELS 3 Xposition Yposition Zposition', 1), 0)).toEqual([]);
  });
});

describe('BVH source frames', () => {
  it('retains rotation channel order and every final-frame value', () => {
    const motion = parseBvh(panTiltBvh());
    const rotations = motion.rotations!((motion.frames - 1) * motion.frameTime);

    expect(rotations.get('Head')).toEqual([
      { axis: 'Y', degrees: -60 },
      { axis: 'X', degrees: -30 },
    ]);
  });

  it('holds the last source frame and permits seeking back to the first frame', () => {
    const motion = parseBvh(planarBvh());
    const first = motion.sample(0).get('Tool')!.clone();
    const last = motion
      .sample((motion.frames - 1) * motion.frameTime)
      .get('Tool')!
      .clone();

    expect(first.toArray()).toEqual([240, 0, 0]);
    expect(last.distanceTo(first)).toBeGreaterThan(1);
    expect(
      motion
        .sample(motion.duration + 1)
        .get('Tool')!
        .distanceTo(last),
    ).toBe(0);
    expect(motion.sample(0).get('Tool')!.distanceTo(first)).toBe(0);
  });
});
