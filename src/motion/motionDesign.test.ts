import { describe, expect, it } from 'vitest';
import { waveBvh } from '../utils/motionSkeleton.fixtures';
import { actuatorSpec, skeletonMargins } from '../utils/skeletonMargins';
import { ratingAt } from '../utils/actuatorRules';
import { jointVerdict } from '../utils/actuatorSizing';
import { componentWeightG } from '../data/components';
import { skeletonSizing } from '../utils/skeletonSizing';
import { designMotion } from './motionDesign';
import { motionServoOptions } from './motionServos';

const request = { text: waveBvh(), name: 'Wave', heightMm: 300, toleranceMm: 2 };

describe('design from a motion clip', () => {
  it('fits and sizes the shared wave clip with a priced catalog servo on every joint', () => {
    const result = designMotion(request);

    if ('problem' in result) throw new Error(result.problem);

    expect(result.skeleton.joints.length).toBeGreaterThan(0);
    expect(Object.values(result.errors).every((mm) => mm <= request.toleranceMm)).toBe(true);
    expect(result.dynamics).toHaveLength(result.skeleton.joints.length);
    expect([...skeletonMargins(result.skeleton).values()].every((m) => m.status === 'pass')).toBe(true);

    const input = skeletonSizing(result.skeleton);

    if (typeof input === 'string') throw new Error(input);

    for (const [index, joint] of result.skeleton.joints.entries()) {
      const act = actuatorSpec(joint.actuator)!;
      const motion = result.dynamics.find((d) => d.id === joint.id)!;
      const sized = { ...input.joints[index], ...motion };

      expect(act).toBeDefined();
      expect(ratingAt(act, result.volts).rpm! * 6).toBeGreaterThan(motion.peakSpeedDegS);
      expect(jointVerdict(sized, sized, act, result.volts).status).toBe('pass');
    }
  });

  it('uses catalog weights for every servo considered in the mass and inertia checks', () => {
    const options = motionServoOptions();

    expect(options.length).toBeGreaterThan(0);
    expect(options.every((option) => !!componentWeightG(option.key.split('|')[0].replace(/^component:/, '')))).toBe(
      true,
    );
    expect(options.some((option) => option.key === 'component:waveshare-st3215-hs')).toBe(false);
  });

  it('uses an equal or faster servo when the same clip is sped up', () => {
    const slow = designMotion(request);
    const fast = designMotion({ ...request, text: request.text.replace(/Frame Time: [\d.eE+-]+/, 'Frame Time: 0.05') });

    if ('problem' in slow) throw new Error(slow.problem);

    if ('problem' in fast) throw new Error(fast.problem);

    expect(fast.skeleton.joints.map((j) => j.id)).toEqual(slow.skeleton.joints.map((j) => j.id));

    for (const [i, joint] of slow.skeleton.joints.entries()) {
      const before = ratingAt(actuatorSpec(joint.actuator)!, slow.volts).rpm!;
      const after = ratingAt(actuatorSpec(fast.skeleton.joints[i].actuator)!, fast.volts).rpm!;

      expect(after, joint.id).toBeGreaterThanOrEqual(before);
    }
  });

  it('refuses unreadable motion without producing a skeleton', () => {
    expect(designMotion({ ...request, text: 'motion' })).toHaveProperty('problem');
  });
});
