import loadMujoco from '@mujoco/mujoco';
import { expect, it, vi } from 'vitest';
import { CaseCheckSession, replyTransfer, workbenchIdentityReply } from '../caseCheckJob';
import { wireRobot } from '../../workspace/caseChecks';
import { DEFAULT_PROJECT } from '../../types/robotics';
import { workbenchTask } from './tasks.fixtures';
import { sendRobotCommand, connectRobot } from '../../robot/robotStore';

vi.mock('../../robot/robotStore', () => ({ sendRobotCommand: vi.fn(), connectRobot: vi.fn() }));

it('checks source identity without physics and returns only bound rehearsal evidence without robot commands', async () => {
  const fixture = workbenchTask(2);
  const input = { ...fixture.robot, project: { ...DEFAULT_PROJECT, joints: fixture.robot.joints } };
  const job = { unit: 'bench-arm', kase: fixture.kase, robot: wireRobot(input), pose: fixture.pose };
  const initial = workbenchIdentityReply({ type: 'workbench-identity', ...job })!;
  const mj = await loadMujoco();
  const session = new CaseCheckSession();
  const reply = await session.run(mj, { type: 'workbench', ...job });

  if (reply.type !== 'workbench') throw new Error(reply.type);

  expect(reply.result.identity).toEqual(initial.identity);
  expect(reply.result.rehearsal.passed).toBe(true);
  expect(reply.result.replay).toBeNull();
  expect(replyTransfer(reply)).toEqual([]);
  expect(JSON.stringify(reply).length).toBeLessThan(1500);
  expect(sendRobotCommand).not.toHaveBeenCalled();
  expect(connectRobot).not.toHaveBeenCalled();
});
