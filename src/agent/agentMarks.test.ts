import { describe, expect, it } from 'vitest';
import type { SceneMark, ScenePart } from '../types/robotics';
import { markColorName } from '../utils/markColors';
import { describeMarks, marksNote } from './agentMarks';

const parts = [
  { id: 'head', name: 'Head' },
  { id: 'arm', name: 'Left Arm' },
] as ScenePart[];

const mark = (partIds: string[], extra: Partial<SceneMark> = {}): SceneMark => ({
  id: `m-${partIds.join('-')}`,
  points: [
    [0, 100, 10],
    [40, 120, -30],
  ],
  partIds,
  createdAt: '2026-10-19T00:00:00.000Z',
  ...extra,
});

describe('agent marks', () => {
  it('describes each mark in the agent frame with its colour, label and the parts it circles', () => {
    expect(describeMarks([mark(['head', 'gone'])], parts)).toEqual([
      {
        id: 'm-head-gone',
        color: 'red',
        around: [{ id: 'head', name: 'Head' }],
        bounds: { min: [0, -10, 100], max: [40, 30, 120] },
      },
    ]);
    expect(
      describeMarks([mark(['arm'], { color: '#facc15', label: 'this is right', view: 'az:30,el:20' })], parts)[0],
    ).toMatchObject({ color: 'yellow', label: 'this is right', seenFrom: 'az:30,el:20' });
  });

  it('tells the agent what each mark means', () => {
    expect(marksNote(undefined, parts)).toBe('');

    const note = marksNote(
      [mark(['head'], { color: '#facc15', label: 'this is right' }), mark(['head', 'arm'], { color: '#f97316' })],
      parts,
    );

    expect(note).toContain(
      'drew 2 marks on the canvas: yellow around Head, labelled "this is right"; orange around Head, Left Arm.',
    );
    expect(marksNote([mark([])], parts)).toContain('drew 1 mark on the canvas: red.');
  });

  it('names custom colours by hue', () => {
    expect(markColorName('#8b5cf6')).toBe('purple');
    expect(markColorName('#3b82f6')).toBe('blue');
    expect(markColorName('#f5f5f5')).toBe('white');
  });
});
