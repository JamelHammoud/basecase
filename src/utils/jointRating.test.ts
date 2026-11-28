import { describe, expect, it } from 'vitest';
import { COMPONENTS } from '../data/components';
import { jointServos } from '../sim/mjcfEffort';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { ratingAt } from './actuatorRules';
import { component, joint, part, project } from './engineering.fixtures';
import { jointRating } from './engineeringTorque';
import type { CheckContext } from './engineeringTypes';

function context(parts: ScenePart[]): CheckContext {
  const input = { parts, project: project(), measures: {}, servoOutputs: {} };

  return {
    ...input,
    input,
    joints: [],
    byPart: new Map(parts.map((p) => [p.id, p])),
    byId: new Map(),
    all: { grams: 0, com: [0, 0, 0] },
    onFloor: [],
    servos: [],
    bodies: [],
  };
}

function previous(ctx: CheckContext, j: RobotJoint, volts?: number) {
  const specs = jointServos(j, ctx.byPart);

  if (!specs.length) return undefined;

  const ratings = specs.map((spec) => ratingAt(spec, volts));
  const total = { stallNm: 0, ratedNm: 0, ratedEstimated: false, volts: volts ?? 0 };

  for (const rating of ratings) {
    total.stallNm += rating.stallNm;
    total.ratedNm += rating.ratedNm;
    total.ratedEstimated ||= rating.ratedEstimated;
    total.volts = rating.volts;
  }

  const rpms = ratings.map((rating) => rating.rpm);
  const rpm = rpms.every((value) => value !== undefined) ? Math.min(...(rpms as number[])) : undefined;
  const peak = specs.every((spec) => spec.peak) ? { peakNm: total.stallNm } : {};

  return rpm === undefined ? { ...total, ...peak } : { ...total, ...peak, rpm };
}

const catalog = COMPONENTS.flatMap((entry) => {
  const variants = entry.variants?.length ? entry.variants : [{ id: undefined, actuator: entry.actuator }];

  return variants
    .filter((variant) => variant.actuator)
    .map((variant) => component(`${entry.id}-${variant.id}`, entry.id, { componentVariant: variant.id }));
});

describe('joint actuator rating accumulation', () => {
  it('preserves complete ratings across catalog combinations, supplies, missing parts and later edits', () => {
    const ctx = context([...catalog, part('structure')]);
    const supplies = [undefined, 0, 3.7, 7.4, 12, 48, Infinity, NaN];

    for (let index = 0; index < catalog.length; index++) {
      const ids = [catalog[index].id, catalog[(index + 1) % catalog.length].id, 'structure', 'missing'];
      const j = joint('paired', { actuators: ids });

      for (const count of [0, 1, 2, 4]) {
        j.actuators = ids.slice(0, count);

        for (const volts of supplies) expect(jointRating(ctx, j, volts)).toEqual(previous(ctx, j, volts));
      }

      j.actuators = [ids[0], ids[0]];
      expect(jointRating(ctx, j)).toEqual(previous(ctx, j));
    }

    expect(jointRating(ctx, joint('empty', {}))).toBeUndefined();
    expect(jointRating(ctx, joint('unknown', { actuators: ['missing', 'structure'] }))).toBeUndefined();
    expect([...ctx.byPart.values()]).toEqual([...catalog, part('structure')]);
  });
});
