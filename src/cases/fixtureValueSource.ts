import { fixtureSource } from './fixtureAssembly';
import type { CustomModelDefinition } from '../types/robotics';
import type { ParamKey, GoalValues } from './goalParams';

export function fixtureValueSupplied(model: CustomModelDefinition, key: ParamKey): boolean | undefined {
  const { joint, part } = fixtureSource(model);
  const values: Partial<Record<ParamKey, unknown>> = {
    fixtureMassG: part?.massG,
    fixtureLowerStop: joint?.range?.[0],
    fixtureTravel: joint?.range?.[1],
    fixtureFriction: joint?.frictionloss,
    fixtureDamping: joint?.damping,
    fixtureStiffness: joint?.stiffness,
    fixtureSpringref: joint?.springref,
  };

  return Object.hasOwn(values, key) ? values[key] !== undefined : undefined;
}

export function fixtureValueTitle(
  model: CustomModelDefinition | undefined,
  key: ParamKey,
  given: Partial<GoalValues>,
  label: string,
): string | undefined {
  if (!model) return undefined;

  const supplied = fixtureValueSupplied(model, key);

  if (supplied === undefined) return undefined;

  return supplied || given[key] !== undefined ? `${label}: supplied` : `${label}: estimated`;
}
