import { expect, it, vi } from 'vitest';
import { workspaceKeyHandlers, type WorkspaceKeyDeps } from './useWorkspaceKeys';

it('closes composition before Escape can deselect or cancel ordinary editing tools', () => {
  const close = vi.fn();
  const setSelectedIds = vi.fn();
  const cancelSupport = vi.fn();
  const deps = {
    core: {
      tool: {},
      annotations: {},
      marks: {},
      selection: {},
      sketching: { cancelSupport },
      setSelectedIds,
      studio: {},
    },
    actions: { exports: { composition: { open: true, close } }, edits: {}, ops: {}, joints: {}, creation: {} },
    ui: {},
  } as unknown as WorkspaceKeyDeps;

  workspaceKeyHandlers(deps).deselect?.({} as KeyboardEvent);
  expect(close).toHaveBeenCalledOnce();
  expect(setSelectedIds).not.toHaveBeenCalled();
  expect(cancelSupport).not.toHaveBeenCalled();
});
