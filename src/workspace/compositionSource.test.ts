import { expect, it } from 'vitest';
import { DEFAULT_PROJECT } from '../types/robotics';
import { compositionMatches, compositionSource, sameRenderPose } from './compositionSource';
import { defaultComposition } from '../three/composition/settings';
import type { WorkspaceCore } from './useWorkspaceCore';

it('hides a completed preview after external settings or joint edits, while selection edits retain it', () => {
  const core = {
    active: true,
    parts: [],
    project: { ...DEFAULT_PROJECT, rendering: defaultComposition() },
    scene: { sceneId: 'arm' },
    viewportRef: { current: null },
  } as unknown as WorkspaceCore;
  const source = compositionSource(core);

  expect(compositionMatches({ ...core, selectedIds: ['arm'] }, source)).toBe(true);
  expect(compositionMatches({ ...core, project: { ...core.project, rendering: defaultComposition() } }, source)).toBe(
    false,
  );
  expect(compositionMatches({ ...core, project: { ...core.project, joints: [] } }, source)).toBe(false);
  expect(sameRenderPose({ arm: [1, 2] }, { arm: [1, 2] })).toBe(true);
  expect(sameRenderPose({ arm: [1, 2] }, { arm: [1, 3] })).toBe(false);
  expect(sameRenderPose({ arm: [1, 2] }, {})).toBe(false);
});
