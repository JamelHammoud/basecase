import { editWithOperands, surfaceOperands } from '../../booleans/operands';
import type { DesignParameter, DimensionBinding } from './types';
import type { ScenePart } from '../../types/robotics';
import { renameParameter, removeParameter, type ParameterDesign } from './mutations';
import { planParameterEdit } from './plan';

export type ParameterEdit =
  | { op: 'insert'; parts: ScenePart[] }
  | { op: 'set'; parameter: DesignParameter }
  | { op: 'rename'; name: string; to: string }
  | { op: 'delete'; name: string; resolution?: 'freeze' }
  | { op: 'bind'; part: string; binding: DimensionBinding }
  | { op: 'unbind'; part: string; kind: DimensionBinding['kind']; target: string };

function bindingEdit(design: ParameterDesign, edit: Extract<ParameterEdit, { op: 'bind' | 'unbind' }>) {
  const binding = edit.op === 'bind' ? edit.binding : edit;
  const target = surfaceOperands(design.parts).find((part) => part.id === edit.part);

  if (!target) throw new Error(`Missing dimension target ${edit.part}.`);

  const kept = (target.dimensionBindings ?? []).filter(
    (item) => item.kind !== binding.kind || item.target !== binding.target,
  );
  const dimensionBindings = edit.op === 'bind' ? [...kept, edit.binding] : kept;
  const parts = editWithOperands(design.parts, (flat) =>
    flat.map((part) => (part.id === edit.part ? { ...part, dimensionBindings } : part)),
  );

  return { ...design, parts };
}

function mutateParameterDesign(design: ParameterDesign, edit: ParameterEdit): ParameterDesign {
  if (!edit || !['set', 'rename', 'delete', 'bind', 'unbind', 'insert'].includes(edit.op))
    throw new Error('Choose a supported parameter edit.');

  if (edit.op === 'insert') return { ...design, parts: [...design.parts, ...edit.parts] };

  if (edit.op === 'rename') return renameParameter(design, edit.name, edit.to);

  if (edit.op === 'delete') return removeParameter(design, edit.name, edit.resolution);

  if (edit.op !== 'set') return bindingEdit(design, edit);

  const existing = design.parameters.some((parameter) => parameter.name === edit.parameter.name);
  const parameters = existing
    ? design.parameters.map((parameter) => (parameter.name === edit.parameter.name ? edit.parameter : parameter))
    : [...design.parameters, edit.parameter];

  return { ...design, parameters };
}

export function editParameterBatch(design: ParameterDesign, edits: ParameterEdit[]): ParameterDesign {
  const next = edits.reduce(mutateParameterDesign, design);

  planParameterEdit(next.parts, next.parameters);

  return next;
}

export const editParameterDesign = (design: ParameterDesign, edit: ParameterEdit) => editParameterBatch(design, [edit]);

export function assertAgentParameterEdits(edits: unknown): asserts edits is ParameterEdit[] {
  if (
    !Array.isArray(edits) ||
    edits.length < 1 ||
    edits.length > 128 ||
    edits.some((edit) => !edit || !['set', 'rename', 'delete', 'bind', 'unbind'].includes(edit.op))
  )
    throw new Error('Send between 1 and 128 supported parameter edits.');
}
