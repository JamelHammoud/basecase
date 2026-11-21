import type { ModelJoint } from './model';

export function readJointSprings(
  attribute: (name: string) => string | undefined,
  coordinate: (value: number) => number,
): Pick<ModelJoint, 'stiffness' | 'springref'> {
  const stiffness = attribute('stiffness');
  const rest = attribute('springref');
  const k = stiffness === undefined ? undefined : Number(stiffness);
  const q = rest === undefined ? undefined : coordinate(Number(rest));

  if ((k !== undefined && (!Number.isFinite(k) || k < 0 || k > 1e6)) || (q !== undefined && !Number.isFinite(q)))
    throw new Error('Use finite spring values and nonnegative stiffness.');

  return { ...(k === undefined ? {} : { stiffness: k }), ...(q === undefined ? {} : { springref: q }) };
}

export function readJointResistance(
  attribute: (name: string) => string | undefined,
): Pick<ModelJoint, 'damping' | 'frictionloss'> {
  const damping = attribute('damping');
  const frictionloss = attribute('frictionloss');

  return {
    ...(damping === undefined ? {} : { damping: Number(damping) }),
    ...(frictionloss === undefined ? {} : { frictionloss: Number(frictionloss) }),
  };
}
