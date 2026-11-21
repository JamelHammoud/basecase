import { expect, it, vi } from 'vitest';
import { recordedLink } from './recordedLink';
import type { RobotEvent } from '../../robot/robotState';

const saving = vi.hoisted(() => ({ finish: () => {} }));

vi.mock('../../cases/tryStore', () => ({
  keepSession: () =>
    new Promise<void>((resolve) => {
      saving.finish = resolve;
    }),
}));

it('publishes a saved recording before its completion boundary', async () => {
  let emit: (event: RobotEvent) => void = () => {};
  const events: RobotEvent[] = [];
  const link = recordedLink({
    onRobotEvent: (listener) => {
      emit = listener;

      return () => {};
    },
    robotCommand: async () => ({ ok: true }),
  });

  link.onRobotEvent!((event) => events.push(event));
  emit({
    event: 'link',
    state: 'connected',
    unit: 'robot',
    spec: { family: 'feetech', class: 'arm', ids: [1], emulated: true },
  });
  emit({ event: 'calibration', unit: 'robot', joints: [{ id: 1, zero_counts: 2048, direction: 1 }] });
  emit({ event: 'hello', unit: 'robot', emulated: true });
  emit({
    event: 'status',
    unit: 'robot',
    mode: 'test',
    run: 'running',
    joints: [{ id: 1, position: 2048, torque_on: true }],
  });
  await link.robotRecord!(
    { scene: { sceneId: 'scene', modelHash: 'a'.repeat(64), joints: ['joint'], robot: 'Arm' } },
    'robot',
  );

  const state = await link.robotState!('robot');
  const claim = await link.robotCommand!(
    {
      cmd: 'claim_control',
      control: state.control,
      seconds: 0.2,
      recording: { recommendation: 'b'.repeat(64), sourceKey: 'c'.repeat(64) },
      binding: {
        spec: state.spec,
        calibration: state.calibration,
        start: [0],
        scene: { sceneId: 'scene', modelHash: 'a'.repeat(64), joints: ['joint'] },
      },
    },
    'robot',
  );

  expect(claim.ok).toBe(true);

  if (!claim.ok) throw new Error(claim.message);

  await link.robotCommand!({ cmd: 'stop', control: claim.control }, 'robot');
  expect(events.some((event) => event.event === 'control' && event.held === false)).toBe(false);
  saving.finish();
  await Promise.resolve();
  await Promise.resolve();

  const recorded = events.findIndex((event) => event.event === 'recorded' && !!event.manifest);
  const completed = events.findIndex((event) => event.event === 'control' && event.held === false);

  expect(recorded).toBeGreaterThanOrEqual(0);
  expect(completed).toBeGreaterThan(recorded);
});
