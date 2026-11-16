import { expect, it, vi } from 'vitest';
import { exportClassroom } from './classroomActions';
import type { WorkspaceCore } from './useWorkspaceCore';
import { DEFAULT_PROJECT } from '../types/robotics';
import { classroomFixture } from '../classroom/fixtures';
import { classroomFileClient } from '../classroom/fileClient';
import { downloadBytes } from '../utils/downloadBytes';

vi.mock('../classroom/fileClient', () => ({
  classroomFileClient: vi.fn(() => ({ call: vi.fn(), dispose: vi.fn() })),
}));
vi.mock('../utils/downloadBytes', () => ({ downloadBytes: vi.fn() }));

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

it.each(['parts', 'project'] as const)(
  'refuses a stale export when %s change during worker preparation',
  async (field) => {
    const { bundle } = classroomFixture();
    const parts = bundle.robot.parts;
    const project = { ...DEFAULT_PROJECT, budgetUsd: 60 };
    const docs = { partsRef: { current: parts }, projectRef: { current: project } };
    const client = {
      call: vi.fn(async () => {
        if (field === 'parts') docs.partsRef.current = [...parts];
        else docs.projectRef.current = { ...project, budgetUsd: 61 };

        return new Uint8Array([1]);
      }),
      dispose: vi.fn(),
    };

    vi.mocked(classroomFileClient).mockReturnValueOnce(client);

    const showToast = vi.fn();
    const core = {
      parts,
      project,
      docs,
      scene: { sceneName: 'Class robot' },
      simTraining: { cases: { active: bundle.case } },
      viewportRef: { current: { meshesReady: async () => [], partTriangles: () => null } },
      showToast,
    } as unknown as WorkspaceCore;

    await exportClassroom(core);
    expect(showToast).toHaveBeenCalledExactlyOnceWith('The scene changed. Export again.', { tone: 'error' });
    expect(downloadBytes).not.toHaveBeenCalled();
    expect(client.dispose).toHaveBeenCalledOnce();
  },
);
