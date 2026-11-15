import { describe, expect, it } from 'vitest';
import { exploreSpace } from '../cases/exploreDesigns';
import { COMPONENT_BY_ID } from '../data/components';
import { withServos } from '../sim/fixtures/servoLegs';
import { box } from '../sim/fixtures/parts';
import { DEFAULT_PROJECT } from '../types/robotics';
import { defaultStudyKnobs } from './defaults';

describe('Study actuator defaults', () => {
  it('includes every single-version STS3250 joint and an editable one-value supply setting', () => {
    const robot = withServos('quad-servo', { componentId: 'feetech-sts3250' });
    const project = { ...DEFAULT_PROJECT, joints: robot.joints, tether: { volts: 12, amps: 4 } };
    const knobs = defaultStudyKnobs(robot.parts, project);
    const servos = knobs.filter((knob) => knob.kind === 'servo');

    expect(servos).toHaveLength(robot.joints.length);
    expect(servos.map((knob) => knob.joints)).toEqual(robot.joints.map((joint) => [joint.id]));
    expect(servos.every((knob) => knob.values.length === 1 && knob.values[0] === 'component:feetech-sts3250')).toBe(
      true,
    );
    expect(knobs.find((knob) => knob.kind === 'voltage')?.values).toEqual([12]);
  });

  it('keeps existing servo versions with the current choice first and preserves Explore voltage choices', () => {
    const robot = withServos('quad-servo', { componentId: 'feetech-sts3215', variant: 'c044' });
    const project = { ...DEFAULT_PROJECT, joints: robot.joints };
    const knobs = defaultStudyKnobs(robot.parts, project);
    const servo = knobs.find((knob) => knob.kind === 'servo');
    const versions = COMPONENT_BY_ID['feetech-sts3215']
      .variants!.filter((variant) => variant.actuator)
      .map((variant) => `component:feetech-sts3215|${variant.id}`);

    expect(servo?.values[0]).toBe('component:feetech-sts3215|c044');
    expect(new Set(servo?.values)).toEqual(new Set(versions));
    expect(knobs.find((knob) => knob.kind === 'voltage')?.values).toEqual(exploreSpace(robot.parts, project)!.volts);
  });

  it('hides the supply setting when a physical source fixes the voltage without hiding joint choices', () => {
    const robot = withServos('quad-servo', { componentId: 'feetech-sts3250' });
    const battery = {
      ...box('pack', [0, 20, 0], [30, 20, 60], 100),
      kind: 'component' as const,
      componentId: 'ovonic-4s-2200-35c',
    };
    const knobs = defaultStudyKnobs([...robot.parts, battery], { ...DEFAULT_PROJECT, joints: robot.joints });

    expect(knobs.filter((knob) => knob.kind === 'servo')).toHaveLength(robot.joints.length);
    expect(knobs.some((knob) => knob.kind === 'voltage')).toBe(false);
  });
});
