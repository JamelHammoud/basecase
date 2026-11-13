import { describe, expect, it } from 'vitest';
import { armTemplate, bipedTemplate } from '../../electron/cad-mcp/recipes/templates.mjs';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { RobotSkeleton } from '../types/skeleton';
import { servoUp, skeletonMargins, withActuator } from '../utils/skeletonMargins';
import { docFromParts, liveEdit, pushHistory, stepHistory } from '../workspace/docHistory';
import { toCad, type V3 } from './agentFrame';
import { specToPart } from './agentScene';
import { dragJoint } from './skeletonDrag';
import { resolveFrames } from './skeletonFrames';
import { templateSkeleton } from './skeletonTemplates';

const FRAMED: Array<[string, string]> = [
  ['left-thigh', 'left-hip_pitch'],
  ['left-shin', 'left-knee'],
  ['left-knee-servo', 'left-knee'],
  ['left-foot', 'left-ankle'],
  ['right-shin', 'right-knee'],
  ['right-foot', 'right-ankle'],
];

function bipedScene(): { skeleton: RobotSkeleton; parts: ScenePart[] } {
  const skeleton = templateSkeleton('biped');
  const project: ProjectSettings = { printer: 'default', material: 'PLA', infillPct: 20, skeleton };
  const { ops } = resolveFrames(
    FRAMED.map(([id, frame]) => ({
      op: 'add' as const,
      part: { id, shape: 'box' as const, size: [30, 30, 60] as V3, position: [0, 0, -30] as V3, frame },
    })),
    project,
  );

  return { skeleton, parts: ops.flatMap((op) => (op.op === 'add' ? [specToPart(op.part)] : [])) };
}

const cadOf = (parts: ScenePart[], id: string) => toCad(parts.find((p) => p.id === id)!.position);
const originOf = (skeleton: RobotSkeleton, id: string) => skeleton.joints.find((j) => j.id === id)!.origin;
const marginOf = (skeleton: RobotSkeleton, id: string) => skeletonMargins(skeleton).get(id)!.margin;

describe('dragging a skeleton joint', () => {
  it('moves the knee, everything below it, every part framed there, and its mirrored twin', () => {
    const { skeleton, parts } = bipedScene();
    const dragged = dragJoint(skeleton, parts, { id: 'left-knee', delta: [0, 0, -20] });

    for (const id of ['left-shin', 'left-knee-servo', 'left-foot', 'right-shin', 'right-foot']) {
      const [x, y, z] = cadOf(parts, id);

      expect(cadOf(dragged.parts, id), id).toEqual([x, y, z - 20]);
    }

    expect(cadOf(dragged.parts, 'left-thigh')).toEqual(cadOf(parts, 'left-thigh'));
    expect(originOf(dragged.skeleton, 'left-knee')[2]).toBeCloseTo(originOf(skeleton, 'left-knee')[2] - 20);
    expect(originOf(dragged.skeleton, 'right-knee')[2]).toBeCloseTo(originOf(skeleton, 'right-knee')[2] - 20);
    expect(originOf(dragged.skeleton, 'right-ankle')[2]).toBeCloseTo(originOf(skeleton, 'right-ankle')[2] - 20);
  });

  it('mirrors a sideways drag onto the twin', () => {
    const { skeleton, parts } = bipedScene();
    const dragged = dragJoint(skeleton, parts, { id: 'left-hip_roll', delta: [10, 0, 0] });

    expect(originOf(dragged.skeleton, 'left-hip_roll')[0]).toBeCloseTo(originOf(skeleton, 'left-hip_roll')[0] + 10);
    expect(originOf(dragged.skeleton, 'right-hip_roll')[0]).toBeCloseTo(originOf(skeleton, 'right-hip_roll')[0] - 10);
    expect(cadOf(dragged.parts, 'right-foot')[0]).toBeCloseTo(cadOf(parts, 'right-foot')[0] - 10);
  });

  it('changes the margins the way the levers do', () => {
    const { skeleton, parts } = bipedScene();
    const lower = dragJoint(skeleton, parts, { id: 'left-knee', delta: [0, 0, -20] }).skeleton;
    const alone = dragJoint(skeleton, parts, { id: 'left-knee', delta: [0, 0, -20], alone: true }).skeleton;

    expect(marginOf(lower, 'left-hip_pitch')).toBeLessThan(marginOf(skeleton, 'left-hip_pitch'));
    expect(marginOf(lower, 'left-knee')).toBeCloseTo(marginOf(skeleton, 'left-knee'), 3);
    expect(marginOf(alone, 'left-knee')).toBeGreaterThan(marginOf(skeleton, 'left-knee'));
    expect(
      cadOf(dragJoint(skeleton, parts, { id: 'left-knee', delta: [0, 0, -20], alone: true }).parts, 'left-foot'),
    ).toEqual(cadOf(parts, 'left-foot'));
  });

  it('undoes the whole drag in one step', () => {
    const { skeleton, parts } = bipedScene();
    const dragged = dragJoint(skeleton, parts, { id: 'left-knee', delta: [0, 0, -20] });
    const tracked = { pose: undefined, joints: undefined, marks: undefined };
    const live = liveEdit(docFromParts(parts), dragged.parts);
    const committed = pushHistory(live, live.parts, { ...tracked, skeleton });
    const undone = stepHistory(committed, { parts: committed.parts, ...tracked, skeleton: dragged.skeleton }, 'undo');

    expect(committed.past).toHaveLength(1);
    expect(undone?.doc.parts).toBe(parts);
    expect(undone?.to.skeleton).toBe(skeleton);
  });
});

describe('skeleton templates', () => {
  it('start from the recipe templates’ joints', () => {
    expect(templateSkeleton('arm').joints).toHaveLength(armTemplate().joints.length);
    expect(templateSkeleton('biped').joints).toHaveLength(bipedTemplate().joints.length);
    expect(templateSkeleton('biped').pairs).toContainEqual(['left-knee', 'right-knee']);
  });

  it('size every joint on its servo, and offer a stronger one', () => {
    const skeleton = templateSkeleton('biped');
    const margins = skeletonMargins(skeleton);
    const up = servoUp(skeleton.joints[0].actuator);

    expect(margins.size).toBe(skeleton.joints.length);
    expect([...margins.values()].every((m) => m.status === 'pass')).toBe(true);
    expect(up?.key).toMatch(/^component:feetech-/);
    expect(marginOf(withActuator(skeleton, 'left-knee', up!.key), 'left-knee')).toBeGreaterThan(
      marginOf(skeleton, 'left-knee'),
    );
  });
});
