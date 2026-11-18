import { parameterCadDimensions } from './cadDimensions';
import { surfaceOperands } from '../../booleans/operands';
import type { ScenePart, ProjectSettings } from '../../types/robotics';
import type { DimensionBinding } from './types';
import { planParameterEdit, type ParameterPartPlan } from './plan';
import { errorMessage } from '../errorMessage';
import { hasEmbeddedParameterBindings } from './transfers';
import type { ParameterEdit } from './edits';
import type { ParameterDesign } from './mutations';

const verified = new WeakMap<object, WeakMap<DimensionBinding[], string>>();
const key = (part: ScenePart) => part.cad ?? part.sketch ?? part.dimensions;
const signature = (plan: ParameterPartPlan) =>
  JSON.stringify([plan.part.dimensionBindings, plan.values, plan.part.dimensions]);

export function rememberParameterDesign(parts: ScenePart[], parameters: unknown) {
  for (const plan of planParameterEdit(parts, parameters)) {
    const geometry = key(plan.part);

    if (!verified.has(geometry)) verified.set(geometry, new WeakMap());

    verified.get(geometry)!.set(plan.part.dimensionBindings!, signature(plan));
  }
}

const known = (part: ScenePart) => part.dimensionBindings && verified.get(key(part))?.get(part.dimensionBindings);

function currentValue(plan: ParameterPartPlan, target: string) {
  if (plan.kind === 'primitive') return plan.part.dimensions[target as keyof ScenePart['dimensions']];

  if (plan.kind === 'cad') return parameterCadDimensions(plan.part.cad!).find((row) => row.name === target)?.value;

  const constraint = plan.part.sketch!.sketch.constraints.find((item) => item.id === target);

  return constraint && 'value' in constraint ? constraint.value : undefined;
}

export function parameterDesignStatus(
  parts: ScenePart[],
  parameters: unknown,
): { state: 'current' | 'pending' | 'failed'; reason?: string; pendingIds?: string[] } {
  try {
    const plans = planParameterEdit(parts, parameters ?? []);
    const pendingIds = plans.filter((plan) => known(plan.part) !== signature(plan)).map((plan) => plan.part.id);

    for (const plan of plans) {
      const mismatch = Object.entries(plan.values).find(([target, value]) => currentValue(plan, target) !== value);

      if (mismatch)
        return {
          state: 'failed',
          reason: `${plan.part.name} (${plan.part.id}): ${mismatch[0]} differs from its parameter.`,
          pendingIds,
        };
    }

    return { state: pendingIds.length ? 'pending' : 'current', pendingIds };
  } catch (error) {
    return { state: 'failed', reason: errorMessage(error) };
  }
}

export function validateParameterRecords(parts: ScenePart[], parameters: unknown) {
  if (hasEmbeddedParameterBindings(parts))
    throw new Error('Unbind dimensions embedded in a saved model before inserting it.');

  const bound = surfaceOperands(parts).some((part) => part.dimensionBindings !== undefined);

  if (!bound && parameters === undefined) return;

  const status = parameterDesignStatus(parts, parameters);

  if (status.state === 'failed') throw new Error(status.reason);
}

export function parameterGeometryEvidence(parts: ScenePart[]) {
  const bound = surfaceOperands(parts).filter((part) => part.dimensionBindings?.length);

  return bound.length
    ? JSON.stringify(bound.map((part) => [part.id, part.dimensionBindings, known(part) ?? 'pending']))
    : '';
}

export function validateParameterScene(scene: { parts: ScenePart[]; project?: ProjectSettings }) {
  validateParameterRecords(scene.parts, scene.project?.designParameters);
}

export function parameterVerificationTargets(
  baseline: ParameterDesign,
  design: ParameterDesign,
  edits: ParameterEdit[],
) {
  const metadataOnly = edits.length > 0 && edits.every((item) => ['rename', 'delete', 'unbind'].includes(item.op));

  if (metadataOnly && parameterDesignStatus(baseline.parts, baseline.parameters).state === 'current') return [];

  const pending = parameterDesignStatus(design.parts, design.parameters).pendingIds ?? [];

  return [...new Set([...pending, ...edits.flatMap((item) => (item.op === 'bind' ? [item.part] : []))])];
}
