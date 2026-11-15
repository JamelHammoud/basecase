import { describe, expect, it } from 'vitest';
import { bracketAndServo } from '../agent/fixtures/tunedBracket';
import { DEFAULT_PROJECT, type ProjectSettings } from '../types/robotics';
import { docFromParts, pushHistory, trackedOf, travelProject } from './docHistory';

describe('applying a Study', () => {
  it('restores every part, joint and supply in one undo and redo while retaining later project settings', () => {
    const parts = bracketAndServo();
    const original: ProjectSettings = { ...DEFAULT_PROJECT, tether: { volts: 6, amps: 5 }, joints: [] };
    const applied = parts.map((part) => ({
      ...part,
      position: [part.position[0], part.position[1] + 2, part.position[2]] as [number, number, number],
    }));
    const project = { ...original, tether: { volts: 7.4, amps: 5 }, infillPct: 30 };
    const doc = pushHistory(docFromParts(parts), applied, { ...trackedOf(original), tether: original.tether });
    const undone = travelProject(doc, project, { direction: 'undo' })!;

    expect(undone.doc.parts).toBe(parts);
    expect(undone.project.tether).toEqual(original.tether);
    expect(undone.project.joints).toBe(original.joints);
    expect(undone.project.infillPct).toBe(30);
    expect(undone.doc.past).toHaveLength(0);

    const redone = travelProject(undone.doc, undone.project, { direction: 'redo' })!;

    expect(redone.doc.parts).toBe(applied);
    expect(redone.project.tether).toEqual(project.tether);
    expect(redone.doc.past).toHaveLength(1);
  });
});
