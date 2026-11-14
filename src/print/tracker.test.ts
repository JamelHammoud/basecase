import { describe, expect, it } from 'vitest';
import type { PrintRecord, ScenePart } from '../types/robotics';
import { readySteps, withRecord } from './tracker';

const part = (id: string, extra: Partial<ScenePart> = {}): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 20, height: 20, depth: 20 },
  color: '#eeeeee',
  note: '',
  visible: true,
  locked: false,
  ...extra,
});

const parts = [
  part('base'),
  part('leg'),
  part('foot'),
  part('screw', { kind: 'hardware', hardware: { type: 'socket_head', size: 'M3', length: 8 } }),
  part('spacer', { print: { skip: true } }),
];
const steps = [['base', 'screw'], ['leg', 'foot'], ['screw'], ['foot', 'spacer']];
const keyOf = (p: ScenePart) => `${p.id}@1`;

const printed = (ids: string[], key = keyOf): PrintRecord[] =>
  withRecord([], {
    id: `print-${ids.join('-')}`,
    plate: 1,
    material: 'PLA',
    hash: ids.join('|'),
    parts: ids.map((id) => ({ id, key: key(parts.find((p) => p.id === id)!) })),
    printer: 'P1S',
    sentAt: '2026-11-13T10:00:00.000Z',
    state: 'printed',
  });

describe('steps whose printed parts are ready', () => {
  it('marks a step only when every one of its printed parts is printed', () => {
    expect(readySteps(steps, { parts, records: printed(['base', 'leg']), keyOf })).toEqual([true, false, false, false]);
    expect(readySteps(steps, { parts, records: printed(['base', 'leg', 'foot']), keyOf })).toEqual([
      true,
      true,
      false,
      true,
    ]);
  });

  it('forgets a part whose shape changed after it printed', () => {
    const records = printed(['base'], (p) => `${p.id}@0`);

    expect(readySteps(steps, { parts, records, keyOf })[0]).toBe(false);
  });

  it('marks nothing before anything prints', () => {
    expect(readySteps(steps, { parts, keyOf })).toEqual([false, false, false, false]);
  });
});
