import { expect, it, vi } from 'vitest';
import { exportClassroom } from './classroomActions';
import type { WorkspaceCore } from './useWorkspaceCore';

it('refuses export when a shipped catalog mesh did not resolve', async () => {
  const showToast = vi.fn();
  const core = {
    parts: [],
    viewportRef: { current: { meshesReady: async () => ['feetech-sts3215'] } },
    showToast,
  } as unknown as WorkspaceCore;

  await exportClassroom(core);
  expect(showToast).toHaveBeenCalledExactlyOnceWith('Load the robot’s meshes before exporting.', { tone: 'error' });
});
