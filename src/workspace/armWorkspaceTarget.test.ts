import { expect, it } from 'vitest';
import { workspaceTarget } from './armWorkspaceTarget';
import type { RobotAnimation } from '../types/robotics';

it('keeps earlier targets and authored names when adding successive plans for a robot', () => {
  const planned: RobotAnimation = {
    id: 'reach-plan',
    name: 'Reach plan',
    duration: 10,
    interpolation: 'linear',
    loop: false,
    keyframes: [
      { t: 0, values: { elbow: 0 } },
      { t: 8, values: { elbow: 30 } },
    ],
  };
  const first = workspaceTarget(planned, [], 'arm');
  const authored = { ...first, id: 'authored', name: 'Workspace target 2' };
  const existing = [first, authored];
  const before = JSON.stringify({ planned, existing });
  const next = workspaceTarget(planned, existing, 'arm');
  const last = workspaceTarget(planned, [...existing, next], 'arm');

  expect(first.name).toBe('Workspace target');
  expect(next.name).toBe('Workspace target 3');
  expect(last.name).toBe('Workspace target 4');
  expect(new Set([first.id, authored.id, next.id, last.id]).size).toBe(4);
  expect(next.robot).toBe('arm');
  expect(next.keyframes).toEqual(planned.keyframes);
  expect(JSON.stringify({ planned, existing })).toBe(before);
});
