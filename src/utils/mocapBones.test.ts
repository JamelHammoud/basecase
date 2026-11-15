import { describe, expect, it } from 'vitest';
import { autoMapBones, type Keypoint, type Mocap } from './mocapBones';
import { parseBvh } from './mocap';
import { walkBvh } from './mocap.fixtures';

const source = parseBvh(walkBvh());
const motion = (bones: string[], parents: Array<[string, string | null]> = []): Mocap => ({
  ...source,
  bones,
  root: 'Fallback',
  parentOf: new Map(parents),
});
const aliases: Array<[string, string[]]> = [
  ['Shoulder', ['upper arm', 'upperarm', 'arm', 'shldr', 'shoulder']],
  ['Elbow', ['fore arm', 'forearm', 'elbow']],
  ['Wrist', ['hand', 'wrist']],
  ['Hip', ['up leg', 'upleg', 'upper leg', 'upperleg', 'thigh', 'hip']],
  ['Knee', ['leg', 'shin', 'knee', 'calf']],
  ['Ankle', ['foot', 'ankle']],
  ['Toe', ['toe base', 'toebase', 'toe', 'toes', 'ball']],
];

describe('automatic motion bone mapping', () => {
  it('retains recognized limb names with namespaces, side words and suffix tags', () => {
    for (const [kind, names] of aliases) {
      for (const name of names) {
        const left = `mixamorig:Left_${name}`;
        const right = `Bip001_${name}_r`;
        const result = autoMapBones(motion([left, right]));

        expect(result[`left${kind}` as Keypoint]).toBe(left);
        expect(result[`right${kind}` as Keypoint]).toBe(right);
      }
    }
  });

  it('keeps compact prefixes, camel case and the parsed BVH hierarchy', () => {
    const result = autoMapBones(motion(['lShldr', 'rForeArm', 'LeftUpLeg', 'RightToeBase']));

    expect(result).toMatchObject({
      leftShoulder: 'lShldr',
      rightElbow: 'rForeArm',
      leftHip: 'LeftUpLeg',
      rightToe: 'RightToeBase',
    });
    expect(autoMapBones(source)).toEqual({
      leftShoulder: 'LeftArm',
      leftElbow: 'LeftForeArm',
      leftWrist: 'LeftHand',
      leftHip: 'LeftUpLeg',
      leftKnee: 'LeftLeg',
      leftAnkle: 'LeftFoot',
      leftToe: 'LeftToeBase',
      rightShoulder: 'RightArm',
      rightElbow: 'RightForeArm',
      rightWrist: 'RightHand',
      rightHip: 'RightUpLeg',
      rightKnee: 'RightLeg',
      rightAnkle: 'RightFoot',
      rightToe: 'RightToeBase',
      hips: 'Hips',
      neck: 'Neck',
      head: 'Head',
      chest: 'Spine1',
    });
  });

  it('prioritizes aliases before source order and keeps the first equivalent name', () => {
    const bones = ['LeftShoulder', 'LeftArm', 'left_upperarm', 'Left_Upper_Arm', 'RightWrist', 'RightHand'];

    expect(autoMapBones(motion(bones))).toMatchObject({
      leftShoulder: 'left_upperarm',
      rightWrist: 'RightHand',
    });
    expect(autoMapBones(motion(bones.toReversed()))).toMatchObject({
      leftShoulder: 'Left_Upper_Arm',
      rightWrist: 'RightHand',
    });
  });

  it('keeps torso source order, exact segment matching and the fallback root', () => {
    const bones = ['Hip2', 'h ip', 'neck2', 'spine3', 'head2', 'Pelvis', 'Hips', 'Neck_1', 'Neck', 'Spine_2', 'Chest'];

    expect(autoMapBones(motion(bones))).toMatchObject({ hips: 'Pelvis', neck: 'Neck_1', chest: 'Spine_2' });
    expect(autoMapBones(motion(['Hip2', 'h ip', 'neck2', 'spine3', 'head2']))).toEqual({
      hips: 'Fallback',
      neck: undefined,
      head: undefined,
      chest: undefined,
    });
    expect(autoMapBones(motion([]))).toEqual({ hips: 'Fallback', neck: undefined, head: undefined, chest: undefined });
  });

  it('uses the nearest common shoulder ancestor other than the hips before a named chest', () => {
    const input = motion(
      ['Hips', 'Chest', 'LeftArm', 'RightArm'],
      [
        ['LeftArm', 'LeftCollar'],
        ['RightArm', 'RightCollar'],
        ['LeftCollar', 'Shared'],
        ['RightCollar', 'Shared'],
        ['Shared', 'Hips'],
      ],
    );
    const before = [...input.parentOf];

    expect(autoMapBones(input).chest).toBe('Shared');
    expect([...input.parentOf]).toEqual(before);

    input.parentOf.set('RightCollar', 'Hips');

    expect(autoMapBones(input).chest).toBe('Chest');

    input.bones = ['Hips', 'LeftArm'];

    expect(autoMapBones(input).chest).toBeUndefined();
  });

  it('reads changed names and ordering afresh without changing inputs or previous results', () => {
    const input = motion(['LeftHand', 'LeftWrist', 'Head']);
    const bones = [...input.bones];
    const first = autoMapBones(input);

    expect(input.bones).toEqual(bones);

    input.bones.splice(0, 1, 'RightHand');

    const latest = autoMapBones(input);

    expect(latest).toMatchObject({ leftWrist: 'LeftWrist', rightWrist: 'RightHand', head: 'Head' });
    expect(first.leftWrist).toBe('LeftHand');
    expect(first.rightWrist).toBeUndefined();

    Object.freeze(input.bones);

    expect(autoMapBones(input)).toEqual(latest);
    expect(input.bones).toEqual(['RightHand', 'LeftWrist', 'Head']);
  });

  it.each([300, 600])('reads each of %i bone names once while matching all landmarks', (count) => {
    const names = Array.from({ length: count - source.bones.length }, (_, i) => `LeftFinger${i}`);
    let reads = 0;
    const bones = new Proxy([...names, ...source.bones], {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

        return Reflect.get(target, key, receiver);
      },
    });
    const result = autoMapBones({ ...source, bones });

    expect(reads).toBe(count);
    expect(result).toEqual(autoMapBones(source));
  });
});
