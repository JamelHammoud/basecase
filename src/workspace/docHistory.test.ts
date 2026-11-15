import { describe, expect, it, vi } from 'vitest';
import { booleanHash } from '../booleans/hash';
import { booleanPart, type BooleanResult } from '../booleans/parts';
import { partsWithResults } from '../booleans/results';
import { DEFAULT_PROJECT, type RobotJoint, type ScenePart } from '../types/robotics';
import type { RobotUpgrade } from '../utils/robotImport';
import { patchEveryState, stepHistory, trackedOf, upgradeDoc } from './docHistory';
import type { DocState, Snapshot } from './types';

const box: ScenePart = {
  id: 'plate',
  name: 'Plate',
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 20, height: 10, depth: 20 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
};

const snapshot = (parts: ScenePart[]): Snapshot => ({ parts, ...trackedOf(DEFAULT_PROJECT) });

const history = (parts: ScenePart[]): DocState => ({
  parts,
  past: Array.from({ length: 50 }, () => snapshot(parts)),
  future: Array.from({ length: 50 }, () => snapshot(parts)),
  base: parts,
});

describe('background updates across scene history', () => {
  it('patches each shared parts array once and keeps boolean results through undo and redo', () => {
    const cut = booleanPart({ id: 'cut', base: box, tools: [{ ...box, id: 'tool' }], op: 'subtract' });
    const parts = [cut];
    const doc = history(parts);
    const result: BooleanResult = {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
      offset: [0, 0, 0],
      size: [1, 1, 1],
    };
    const patch = vi.fn((list: ScenePart[]) => partsWithResults(list, () => result));
    const next = patchEveryState(doc, patch);

    expect(patch).toHaveBeenCalledTimes(1);
    expect(next.parts[0].boolean?.hash).toBe(booleanHash(cut));
    expect(next.parts[0].mesh?.positions).toBe(result.positions);
    expect(next.base).toBe(next.parts);

    for (const state of [...next.past, ...next.future]) expect(state.parts).toBe(next.parts);

    const undone = stepHistory(next, snapshot(next.parts), 'undo')!;
    const redone = stepHistory(undone.doc, snapshot(undone.doc.parts), 'redo')!;

    expect(undone.to.parts).toBe(next.parts);
    expect(redone.to.parts).toBe(next.parts);
    expect(doc.parts).toBe(parts);
    expect(cut.mesh).toBeUndefined();
  });

  it('keeps distinct edits separate and refreshes the patch cache on the next update', () => {
    const current = [box];
    const previous = [{ ...box, note: 'Previous' }];
    const doc = { ...history(current), past: [snapshot(previous)] };
    let note = 'First update';
    const patch = vi.fn((parts: ScenePart[]) => parts.map((part) => ({ ...part, note })));
    const first = patchEveryState(doc, patch);

    expect(patch).toHaveBeenCalledTimes(2);
    expect(first.parts).not.toBe(first.past[0].parts);
    expect(first.past[0].parts[0].note).toBe(note);

    note = 'Second update';

    const second = patchEveryState(doc, patch);

    expect(patch).toHaveBeenCalledTimes(4);
    expect(second.parts[0].note).toBe(note);
    expect(first.parts[0].note).toBe('First update');
  });

  it('keeps an unchanged document intact, including empty arrays and an absent live-edit base', () => {
    const doc = { ...history([]), base: null };
    const patch = vi.fn((parts: ScenePart[]) => partsWithResults(parts, () => undefined));

    expect(patchEveryState(doc, patch)).toBe(doc);
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it('upgrades shared parts and joint arrays once while retaining distinct joint edits', () => {
    const joint: RobotJoint = {
      id: 'hinge',
      name: 'Hinge',
      type: 'revolute',
      parent: [],
      child: ['plate'],
      origin: [0, 0, 0],
      axis: [0, 1, 0],
      range: [-90, 90],
    };
    const joints = [joint];
    const earlier = [{ ...joint, name: 'Earlier hinge' }];
    const doc = history([box]);

    doc.past = doc.past.map((state) => ({ ...state, joints }));
    doc.future = doc.future.map((state) => ({ ...state, joints: earlier }));
    doc.future.push(snapshot([]));

    const up: RobotUpgrade = {
      parts: new Map([['plate', { note: 'Updated' }]]),
      joints: new Map([['hinge', { effortNm: 2 }]]),
      upgraded: [],
      missing: [],
      missingIds: [],
    };
    const partReads = vi.spyOn(up.parts, 'has');
    const jointReads = vi.spyOn(up.joints, 'has');
    const next = upgradeDoc(doc, up);

    expect(partReads).toHaveBeenCalledTimes(1);
    expect(jointReads).toHaveBeenCalledTimes(2);
    expect(next.parts[0].note).toBe('Updated');
    expect(next.base).toBe(next.parts);

    for (const state of [...next.past, ...next.future.slice(0, 50)]) expect(state.parts).toBe(next.parts);

    expect(next.past[0].joints).toBe(next.past[49].joints);
    expect(next.future[0].joints).toBe(next.future[49].joints);
    expect(next.past[0].joints?.[0]).toMatchObject({ name: 'Hinge', effortNm: 2 });
    expect(next.future[0].joints?.[0]).toMatchObject({ name: 'Earlier hinge', effortNm: 2 });
    expect(next.future[50].joints).toBeUndefined();
    expect(joint.effortNm).toBeUndefined();
    expect(box.note).toBe('');
  });
});
