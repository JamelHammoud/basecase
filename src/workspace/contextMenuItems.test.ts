import { describe, expect, it, vi } from 'vitest';
import { servoArm } from '../sim/fixtures/servoArm';
import { buildRig } from '../utils/kinematics';
import { contextMenuItems, type ContextInputs } from './contextMenuItems';

function selectedRobot(count: number, available = true) {
  const robot = servoArm();
  const selectedParts = robot.parts.slice(0, count);
  const show = vi.fn();
  const inputs = {
    core: {
      parts: robot.parts,
      selectedIds: selectedParts.map((p) => p.id),
      selection: { selectedParts },
      caseRun: { open: false },
      posing: { rig: buildRig(robot.joints, robot.parts) },
      simTraining: { sim: { status: 'off', model: null } },
      study: { available, show },
    },
    actions: {
      ops: {},
      edits: {},
      library: {},
      mirror: {},
      arm: { canSize: false },
      workspace: { canInspect: false },
      wrap: { canWrap: () => false },
      robots: { armOfPart: () => null },
      joints: { canJoin: false },
    },
    ui: {},
  } as unknown as ContextInputs;
  const menu = { x: 0, y: 0, partId: selectedParts[0].id, point: null };

  return { entries: contextMenuItems(menu, inputs), show };
}

describe('Study in the robot menu', () => {
  it.each([1, 3])('opens Study when right-clicking a robot with %i selected parts', (count) => {
    const { entries, show } = selectedRobot(count);
    const study = entries.filter((entry) => 'label' in entry && entry.label === 'Study');

    expect(study).toHaveLength(1);

    const entry = study[0];

    if ('onSelect' in entry) entry.onSelect?.();

    expect(show).toHaveBeenCalledOnce();

    const last = entries.at(-1);

    expect(last && 'label' in last ? last.label : null).toBe('Delete');
  });

  it('omits Study when there is no available design to study', () => {
    expect(selectedRobot(1, false).entries.some((entry) => 'label' in entry && entry.label === 'Study')).toBe(false);
  });
});
