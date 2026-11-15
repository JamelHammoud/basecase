import type { V3 } from '../../utils/kinematics';
import type { StudyKnob, StudyRow } from '../../study/types';

export const STUDY_METRICS = [
  { value: 'cost', label: 'Cost' },
  { value: 'mass', label: 'Weight' },
  { value: 'torque', label: 'Torque margin' },
  { value: 'tip', label: 'Tip angle' },
  { value: 'runtime', label: 'Runtime' },
  { value: 'passes', label: 'Case passes' },
] as const;

export type StudyMetric = (typeof STUDY_METRICS)[number]['value'];

export function metricValue(row: StudyRow, metric: StudyMetric): number | undefined {
  if (row.error) return undefined;

  const values = {
    cost: row.costUsd,
    mass: row.massG,
    torque: row.metrics.worstShare === undefined ? undefined : 1 - row.metrics.worstShare,
    tip: row.metrics.tipDeg,
    runtime: row.runtimeMinutes,
    passes: row.runs?.passes,
  };

  return values[metric];
}

export function knobValuesText(knob: StudyKnob): string {
  if (knob.kind === 'foot') return footValuesText(knob);

  if (knob.kind === 'battery_offset') return knob.values.map((v) => v.join(' ')).join(', ');

  return knob.values.join(', ');
}

function footAxis(knob: Extract<StudyKnob, { kind: 'foot' }>): 'length' | 'width' | null {
  if (knob.values.every((v) => v.length !== undefined && v.width === undefined)) return 'length';

  return knob.values.every((v) => v.width !== undefined && v.length === undefined) ? 'width' : null;
}

function footValuesText(knob: Extract<StudyKnob, { kind: 'foot' }>): string {
  const axis = footAxis(knob);

  return knob.values.map((value) => (axis ? value[axis] : `${value.length ?? 1} × ${value.width ?? 1}`)).join(', ');
}

function numbers(text: string, split: RegExp): number[] | null {
  const pieces = text.trim().split(split);
  const values = pieces.map(Number);

  return pieces.some((p) => !p.trim()) || values.some((v) => !Number.isFinite(v)) ? null : values;
}

function footValues(knob: Extract<StudyKnob, { kind: 'foot' }>, pieces: string[]): StudyKnob | null {
  const axis = footAxis(knob);

  if (axis) return footAxisValues(knob, pieces, axis);

  const values = pieces.map((p) => numbers(p, /\s*[×x]\s*/));

  if (values.some((v) => !v || v.length !== 2 || v.some((n) => n <= 0))) return null;

  return { ...knob, values: values.map((v) => ({ length: v![0], width: v![1] })) };
}

const axisValue = (axis: 'length' | 'width', value: number) =>
  axis === 'length' ? { length: value } : { width: value };

function footAxisValues(
  knob: Extract<StudyKnob, { kind: 'foot' }>,
  pieces: string[],
  axis: 'length' | 'width',
): StudyKnob | null {
  const values = numbers(pieces.join(','), /\s*,\s*/);

  return values && values.every((v) => v > 0)
    ? { ...knob, values: values.map((value) => axisValue(axis, value)) }
    : null;
}

function offsetValues(knob: Extract<StudyKnob, { kind: 'battery_offset' }>, pieces: string[]): StudyKnob | null {
  const values = pieces.map((p) => numbers(p, /\s+/));

  if (values.some((v) => !v || v.length !== 3)) return null;

  return { ...knob, values: values.map((v): V3 => [v![0], v![1], v![2]]) };
}

export function editKnobValues(knob: StudyKnob, text: string): StudyKnob | null {
  const pieces = text.split(',').map((v) => v.trim());

  if (pieces.some((p) => !p)) return null;

  if (knob.kind === 'servo' || knob.kind === 'battery') return { ...knob, values: [...new Set(pieces)] };

  if (knob.kind === 'foot') return footValues(knob, pieces);

  if (knob.kind === 'battery_offset') return offsetValues(knob, pieces);

  const values = numbers(text, /\s*,\s*/);

  return values && (knob.kind === 'dimension' || values.every((v) => v > 0))
    ? { ...knob, values: [...new Set(values)] }
    : null;
}

export function toggleCompared(selected: string[], key: string): string[] {
  if (selected.includes(key)) return selected.filter((k) => k !== key);

  return selected.length < 4 ? [...selected, key] : selected;
}
