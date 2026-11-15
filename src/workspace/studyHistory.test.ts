import { describe, expect, it } from 'vitest';
import { bracketAndServo } from '../agent/fixtures/tunedBracket';
import { servoArm } from '../sim/fixtures/servoArm';
import { studyScene } from '../study/scene';
import { buildBom } from '../utils/bom';
import { DEFAULT_PROJECT, type ProjectSettings } from '../types/robotics';
import { docFromParts, pushHistory, trackedOf, travelProject } from './docHistory';

describe('applying a Study', () => {
  it('updates the servo BOM and restores its catalog quantities through one undo and redo', async () => {
    const robot = servoArm();
    const original = { ...DEFAULT_PROJECT, joints: robot.joints };
    const base = { parts: robot.parts, project: original, measures: {}, triangles: {} };
    const chosen = await studyScene(
      base,
      [
        {
          id: 'servos',
          kind: 'servo',
          joints: robot.joints.slice(1).map((joint) => joint.id),
          values: ['component:feetech-sts3215|c001'],
        },
      ],
      [0],
    );
    const components = (parts: typeof robot.parts) =>
      buildBom({ parts, project: original, purchases: {}, measures: {} })
        .lines.filter((line) => line.category === 'Components')
        .map(({ key, qty, partIds }) => ({ key, qty, partIds }));
    const before = components(robot.parts);
    const expected = [
      {
        key: 'component:feetech-sts3215|c001',
        qty: 3,
        partIds: robot.joints.map((joint) => `${joint.id}-servo`),
      },
    ];
    const doc = pushHistory(docFromParts(robot.parts), chosen.parts, trackedOf(original));

    expect(before.map(({ key, qty }) => ({ key, qty }))).toEqual([
      { key: 'component:feetech-sts3215|c044', qty: 2 },
      { key: 'component:feetech-sts3215|c001', qty: 1 },
    ]);
    expect(components(doc.parts)).toEqual(expected);

    const undone = travelProject(doc, chosen.project, { direction: 'undo' })!;

    expect(undone.doc.parts).toEqual(robot.parts);
    expect(components(undone.doc.parts)).toEqual(before);
    expect(undone.doc.past).toHaveLength(0);

    const redone = travelProject(undone.doc, undone.project, { direction: 'redo' })!;

    expect(redone.doc.parts).toEqual(chosen.parts);
    expect(components(redone.doc.parts)).toEqual(expected);
    expect(redone.doc.past).toHaveLength(1);
  });

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
