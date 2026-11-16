import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT, type PrintRecord, type ProjectSettings, type ScenePart } from '../types/robotics';
import { markForReprint, plateStatusLookup, printedKeys, readySteps, splitPrinted, withRecord } from './tracker';
import type { Plate } from './plan';
import { sceneJson } from '../utils/sceneJson';
import { projectFromSeed } from '../workspace/helpers';

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

describe('a replacement print', () => {
  const now = new Date('2026-11-14T10:00:00.000Z');
  const original = printed(['base', 'leg', 'foot']);

  it('persists a request for the same shape while preserving other printed parts and history', async () => {
    const project = { ...DEFAULT_PROJECT, prints: markForReprint(original, 'leg', now) };
    const saved = JSON.parse(await sceneJson({ parts, project })) as { project: ProjectSettings };
    const records = projectFromSeed(saved.project).prints!;

    expect(records).toContainEqual(original[0]);
    expect(printedKeys(records).get('leg')).toBeUndefined();
    expect(splitPrinted(parts, records, keyOf).printed.map((p) => p.id)).toEqual(['base', 'foot']);
    expect(readySteps(steps, { parts, records, keyOf })).toEqual([true, false, false, true]);
    expect(original).toEqual(printed(['base', 'leg', 'foot']));
  });

  it('keeps a replacement pending after a failed print and clears it after a new successful print', () => {
    const requested = markForReprint(original, 'leg', now);
    const replacement = { ...printed(['leg'])[0], id: 'replacement', sentAt: now.toISOString() };
    const failed = withRecord(requested, { ...replacement, state: 'failed' });

    expect(printedKeys(failed).has('leg')).toBe(false);
    expect(printedKeys(withRecord(failed, replacement)).get('leg')).toBe(keyOf(parts[1]));
  });

  it('makes an unchanged plate available again without marking its other parts unprinted', () => {
    const plate = { hash: original[0].hash, items: [{ id: 'base' }, { id: 'leg' }, { id: 'foot' }] } as Plate;
    const records = markForReprint(original, 'leg', now);

    expect(plateStatusLookup(records)(plate).state).toBe('new');
    expect(printedKeys(records).get('base')).toBe(keyOf(parts[0]));

    const replacement = { ...printed(['leg'])[0], id: 'replacement', sentAt: now.toISOString() };

    expect(plateStatusLookup(withRecord(records, replacement))(plate).state).toBe('printed');
  });
});
