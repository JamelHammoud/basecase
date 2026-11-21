import { horizontalDeg } from '../cameras/lens';
import { COMPONENT_BY_ID, componentVariant } from '../data/components';
import { validateStudyKnobs } from './knobs';
import type { StudyKnob, StudySelection } from './types';

export const MAX_STUDY_ROWS = 64;

function numericValues(knob: StudyKnob): number[] {
  if (knob.kind === 'voltage' || knob.kind === 'dimension') return knob.values;

  if (knob.kind === 'battery_offset') return knob.values.flat();

  if (knob.kind === 'foot') return knob.values.flatMap((v) => [v.length ?? 1, v.width ?? 1]);

  return [];
}

function validateKnob(knob: StudyKnob) {
  if (!knob.values.length) throw new Error(`${knob.id}: Add a value to try.`);

  const numbers = numericValues(knob);

  if (numbers.some((n) => !Number.isFinite(n))) throw new Error(`${knob.id}: Use finite values.`);

  if ((knob.kind === 'voltage' || knob.kind === 'foot') && numbers.some((n) => n <= 0))
    throw new Error(`${knob.id}: Use values above zero.`);
}

const decoded = (index: number, knobs: StudyKnob[]): StudySelection => {
  const chosen = new Array<number>(knobs.length);

  for (let i = knobs.length - 1; i >= 0; i--) {
    chosen[i] = index % knobs[i].values.length;
    index = Math.floor(index / knobs[i].values.length);
  }

  return chosen;
};

function random(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) | 0;

    let value = Math.imul(state ^ (state >>> 15), 1 | state);

    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function enumerateStudy(knobs: StudyKnob[], options: { seed?: number; limit?: number } = {}): StudySelection[] {
  if (!validateStudyKnobs(knobs)) throw new Error('Choose between 1 and 64 settings with at most 64 values each.');

  knobs.forEach(validateKnob);

  const limit = options.limit ?? MAX_STUDY_ROWS;

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_STUDY_ROWS) throw new Error('Try between 1 and 64 designs.');

  const size = knobs.reduce((n, knob) => n * knob.values.length, 1);

  if (size <= limit) return Array.from({ length: size }, (_, i) => decoded(i, knobs));

  const draw = random(options.seed ?? 1);
  const rows: StudySelection[] = [];
  const taken = new Set<string>();

  while (rows.length < limit) {
    const row = knobs.map((knob) => Math.floor(draw() * knob.values.length));
    const key = row.join(',');

    if (taken.has(key)) continue;

    taken.add(key);
    rows.push(row);
  }

  return rows;
}

export const studyKey = (selection: StudySelection) => selection.join(',');

export function studyCatalogLabel(key: string): string {
  const [head, variant] = key.split('|');
  const component = COMPONENT_BY_ID[head.replace(/^component:/, '')];

  if (!component) return key;

  return variant ? (componentVariant(component, variant)?.label ?? component.name) : component.name;
}

export function studyLabel(knobs: StudyKnob[], selection: StudySelection): string {
  return knobs
    .map((knob, i) => {
      const value = knob.values[selection[i]];
      const names = {
        servo: 'Servo',
        voltage: 'Voltage',
        battery: 'Battery',
        battery_offset: 'Battery position',
        foot: 'Feet',
        dimension: 'Dimension',
        camera_pose: 'Camera pose',
        camera_lens: 'Camera lens',
      };
      const label = knob.label ?? names[knob.kind];

      if (knob.kind === 'servo' || knob.kind === 'battery')
        return `${label} ${studyCatalogLabel(knob.values[selection[i]])}`;

      if (knob.kind === 'camera_pose') {
        const pose = knob.values[selection[i]];

        return `${label} ${pose.position.join(' ')} mm / ${pose.rotation.join(' ')}°`;
      }

      if (knob.kind === 'camera_lens') {
        const lens = knob.values[selection[i]];

        return `${label} ${lens.model} ${horizontalDeg(lens)}°`;
      }

      if (knob.kind === 'voltage') return `${label} ${String(value)} V`;

      if (knob.kind === 'foot') {
        const foot = knob.values[selection[i]];

        return `${label} ${foot.length ?? 1}× long, ${foot.width ?? 1}× wide`;
      }

      if (Array.isArray(value)) return `${label} ${value.join(', ')} mm`;

      return `${label} ${String(value)}`;
    })
    .join(', ');
}
