import { describe, expect, it } from 'vitest';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { isPrinted } from '../utils/bom';
import { buildRig, forwardKinematics, partMotion, type V3 } from '../utils/kinematics';
import { agentWrapTarget, applyWrap, wrapPlan, wrapTarget } from './wrapPlan';
import { BASE_LINK, type WrapShell } from './wrapTypes';

const part = (id: string, position: V3, extra: Partial<ScenePart> = {}): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position,
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  group: { id: 'arm', name: 'Arm' },
  ...extra,
});

const joint = (id: string, over: Partial<RobotJoint>): RobotJoint => ({
  id,
  name: id,
  type: 'revolute',
  parent: [],
  child: [],
  origin: [0, 0, 0],
  axis: [0, 0, 1],
  ...over,
});

const owl = part('owl', [0, 40, 0], {
  kind: 'mesh',
  group: undefined,
  color: '#c08040',
  mesh: { positions: [], indices: [], baseSize: [1, 1, 1], source: 'owl.glb', file: 'owl.glb' },
});

function scene() {
  const parts = [part('base', [0, 5, 0]), part('upper', [0, 40, 0]), part('fore', [0, 90, 0]), owl];
  const joints = [
    joint('shoulder', { parent: ['base'], child: ['upper'], origin: [0, 15, 0], range: [-45, 45] }),
    joint('elbow', { parent: ['upper'], child: ['fore'], origin: [0, 70, 0], range: [-60, 60] }),
  ];

  return { parts, joints };
}

const shellAt = (link: string, y: number): WrapShell => ({
  link,
  positions: new Float32Array([-5, y, -5, 5, y, -5, 0, y + 5, 5, 0, y - 5, 5]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]),
});

describe('wrapTarget', () => {
  it('needs exactly one imported mesh and one jointed robot in the selection', () => {
    const { parts, joints } = scene();

    expect(wrapTarget(parts, joints, ['owl', 'upper'])?.robot.key).toBe('shoulder');
    expect(wrapTarget(parts, joints, ['upper', 'fore'])).toBeNull();
    expect(wrapTarget(parts, joints, ['owl'])).toBeNull();
    expect(wrapTarget(parts, [], ['owl', 'upper'])).toBeNull();
  });

  it('lets the agent leave out the mesh and the robot when there is only one of each', () => {
    const { parts, joints } = scene();

    expect(agentWrapTarget(parts, joints, { selectedIds: [] })).toMatchObject({ mesh: { id: 'owl' } });
    expect(agentWrapTarget(parts, joints, { mesh: 'base', selectedIds: [] })).toBeTypeOf('string');
  });
});

describe('wrapPlan', () => {
  it('splits the robot into links and lists each joint’s parent link', () => {
    const { parts, joints } = scene();
    const plan = wrapPlan(wrapTarget(parts, joints, ['owl', 'base'])!);

    expect(plan.bodies).toEqual([
      { id: 'base', link: BASE_LINK },
      { id: 'upper', link: 'shoulder' },
      { id: 'fore', link: 'elbow' },
    ]);
    expect(plan.joints.map((j) => [j.id, j.parentLink, j.range])).toEqual([
      ['shoulder', BASE_LINK, [-45, 45]],
      ['elbow', 'shoulder', [-60, 60]],
    ]);
  });
});

describe('applyWrap', () => {
  const wrapped = () => {
    const { parts, joints } = scene();
    const target = wrapTarget(parts, joints, ['owl', 'base'])!;
    const shells = [shellAt(BASE_LINK, 5), shellAt('shoulder', 40), shellAt('elbow', 90)];

    return applyWrap(target, { parts, joints }, shells);
  };

  it('hides the mesh and adds one printed shell per link in the robot’s group', () => {
    const edit = wrapped();

    expect(edit.parts.find((p) => p.id === 'owl')?.visible).toBe(false);
    expect(edit.shells.map((s) => s.name)).toEqual(['owl', 'owl Shoulder', 'owl Elbow']);
    expect(edit.shells.every((s) => isPrinted(s) && s.group?.name === 'Arm' && s.color === owl.color)).toBe(true);
  });

  it('attaches each shell to its link', () => {
    const edit = wrapped();
    const [base, upper, fore] = edit.shells.map((s) => s.id);
    const byId = new Map(edit.joints.map((j) => [j.id, j]));

    expect(byId.get('shoulder')?.child).toEqual(['upper', upper]);
    expect(byId.get('shoulder')?.parent).toEqual(['base', base]);
    expect(byId.get('elbow')?.child).toEqual(['fore', fore]);
    expect(buildRig(edit.joints, edit.parts).robots).toHaveLength(1);
  });

  it('moves each shell with its posed joint', () => {
    const edit = wrapped();
    const [base, upper, fore] = edit.shells.map((s) => s.id);
    const rig = buildRig(edit.joints, edit.parts);
    const posed = forwardKinematics(rig, { values: { shoulder: 30, elbow: -20 } });
    const motion = (id: string) => partMotion(rig, posed, id)?.elements;

    expect(motion(upper)).toEqual(motion('upper'));
    expect(motion(fore)).toEqual(motion('fore'));
    expect(motion(fore)).not.toEqual(motion(upper));
    expect(motion(base)).toEqual(motion('base'));
  });
});
