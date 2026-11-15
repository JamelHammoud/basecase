import type { StudyKnob } from './types';
import { finiteValue, optionalString, recordValue, stringList, stringValue, vectorValue } from './recordValues';

const positive = (value: unknown) => finiteValue(value) && value > 0;
const optionalParts = (value: unknown) => value === undefined || stringList(value);
const footValue = (value: unknown) =>
  recordValue(value) &&
  (value.length === undefined || positive(value.length)) &&
  (value.width === undefined || positive(value.width));

function validKnobFields(value: Record<string, unknown>, values: unknown[]): boolean {
  if (value.kind === 'servo') return stringList(value.joints) && values.every(stringValue);

  if (value.kind === 'voltage') return values.every(positive);

  if (value.kind === 'battery') return optionalParts(value.parts) && values.every(stringValue);

  if (value.kind === 'battery_offset') return optionalParts(value.parts) && values.every(vectorValue);

  if (value.kind === 'foot') return optionalParts(value.parts) && values.every(footValue);

  return value.kind === 'dimension' && stringValue(value.part) && stringValue(value.name) && values.every(finiteValue);
}

function validKnob(value: unknown): boolean {
  if (!recordValue(value) || !stringValue(value.id) || !value.id.trim() || !optionalString(value.label)) return false;

  if (!Array.isArray(value.values) || !value.values.length || value.values.length > 64) return false;

  return validKnobFields(value, value.values);
}

export function validateStudyKnobs(value: unknown): value is StudyKnob[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64 || !value.every(validKnob)) return false;

  return new Set(value.map((knob) => knob.id)).size === value.length;
}
