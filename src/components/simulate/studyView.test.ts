import { describe, expect, it } from 'vitest';
import type { StudyKnob } from '../../study/types';
import { editKnobValues, knobValuesText, toggleCompared } from './studyView';

describe('Study configuration', () => {
  it('reads multiple numeric values without accepting a partial or empty value', () => {
    const knob: StudyKnob = { id: 'volts', kind: 'voltage', values: [6, 7.4] };

    expect(editKnobValues(knob, '6, 7.4, 8.4')).toEqual({ ...knob, values: [6, 7.4, 8.4] });
    expect(editKnobValues(knob, '6, seven')).toBeNull();
    expect(editKnobValues(knob, '')).toBeNull();
    expect(editKnobValues(knob, '6,,8')).toBeNull();
  });

  it('round trips foot and offset choices through their editable display', () => {
    const knobs: StudyKnob[] = [
      { id: 'foot-length', kind: 'foot', values: [{ length: 1 }, { length: 1.5 }] },
      { id: 'foot-width', kind: 'foot', values: [{ width: 1 }, { width: 1.25 }] },
      {
        id: 'feet',
        kind: 'foot',
        values: [
          { length: 60, width: 40 },
          { length: 80, width: 50 },
        ],
      },
      {
        id: 'battery',
        kind: 'battery_offset',
        values: [
          [0, 0, 0],
          [15, 0, -20],
        ],
      },
    ];

    knobs.forEach((knob) => expect(editKnobValues(knob, knobValuesText(knob))).toEqual(knob));
  });

  it('accepts signed named dimensions and keeps voltage above zero', () => {
    const knob: StudyKnob = { id: 'offset', kind: 'dimension', part: 'foot', name: 'offset', values: [0] };

    expect(editKnobValues(knob, '-5, 0, 5')).toEqual({ ...knob, values: [-5, 0, 5] });
    expect(editKnobValues({ id: 'supply', kind: 'voltage', values: [6] }, '0, 6')).toBeNull();
  });

  it('keeps at most four comparison rows and lets a selected row be removed', () => {
    expect(toggleCompared(['a', 'b', 'c', 'd'], 'e')).toEqual(['a', 'b', 'c', 'd']);
    expect(toggleCompared(['a', 'b', 'c', 'd'], 'b')).toEqual(['a', 'c', 'd']);
    expect(toggleCompared(['a'], 'b')).toEqual(['a', 'b']);
  });
});
