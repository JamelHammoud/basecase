import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { rehearseWorkbench } from './rehearsal';
import { workbenchTask } from './tasks.fixtures';
import { placementFrame } from './placement';
import { Vector3 } from 'three';
import { worldDelta } from '../../sim/mjcfFrames';

it('moves the implicit workbench plane with a vertically offset robot base', async () => {
  const mj = await loadMujoco();
  const fixture = workbenchTask(0);
  const pose = { ...fixture.pose, position: [...fixture.pose.position] as [number, number, number] };

  pose.position[1] += 15;

  const result = await rehearseWorkbench(mj, { ...fixture, unit: 'bench-arm', pose });
  const expectedY = placementFrame(pose, [0, 50, 0]).at([0, 0, 0])[1];

  expect(result.replay).not.toBeNull();
  expect(result.rehearsal.passed, JSON.stringify(result.rehearsal)).toBe(true);
  expect(result.replay!.model.xml).toContain(`name="floor" pos="0 0 ${expectedY / 1000}"`);
  expect(result.replay!.kase.world.objects[0].size).toEqual(fixture.kase.world.objects[0].size);

  const replay = result.replay!;
  const block = replay.kase.world.objects.find((object) => object.id === 'block')!;
  const last = Float64Array.from(replay.recording.poses.slice(-replay.recording.nbody * 7));
  const at = new Vector3(...block.position).applyMatrix4(worldDelta(replay.model, last, block.id)!);

  expect(Math.abs(at.y - expectedY - block.size[1] / 2)).toBeLessThan(2);
});
