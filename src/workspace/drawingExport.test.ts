import { describe, expect, it, vi } from 'vitest';
import { sheetPart } from '../sheet/sheet.fixtures';
import { drawingExport } from './drawingExport';
import type { WorkspaceCore } from './useWorkspaceCore';

const work = vi.hoisted(() => ({ build: vi.fn(), dispose: vi.fn() }));

vi.mock('../sheet/drawingsClient', () => ({
  drawingsClient: () => ({ call: work.build, dispose: work.dispose }),
}));

function context() {
  const parts = [sheetPart()];
  const project = { material: 'PLA' };
  const core = {
    parts,
    project,
    scene: { sceneName: 'rover', sceneId: 'rover' },
    docs: { partsRef: { current: parts }, projectRef: { current: project } },
  } as unknown as WorkspaceCore;
  const abort = new AbortController();

  return { core, abort, run: { current: () => core, signal: abort.signal } };
}

const options = { frame: 'part', plane: 'xy', scale: 1 } as const;

describe('mechanical drawing preparation', () => {
  it.each(['parts', 'project', 'scene', 'name', 'tab', 'cancel'])(
    'discards %s changes during worker preparation',
    async (fault) => {
      const { core, abort, run } = context();
      const before = structuredClone(core.parts);

      work.build.mockImplementationOnce(async () => {
        if (fault === 'parts') core.docs.partsRef.current = [];

        if (fault === 'project') core.docs.projectRef.current = { ...core.project };

        if (fault === 'scene') core.scene.sceneId = 'changed';

        if (fault === 'name') core.scene.sceneName = 'changed';

        if (fault === 'tab') core.active = true;

        if (fault === 'cancel') abort.abort();

        return { bytes: new Uint8Array([1]) };
      });
      await expect(drawingExport(core, { ids: ['plate'], options }, run)).rejects.toThrow();
      expect(core.parts).toEqual(before);
      expect(work.dispose).toHaveBeenCalled();
    },
  );

  it('never starts a cancelled export or assembly search', async () => {
    const { core, abort, run } = context();
    const calls = work.build.mock.calls.length;

    abort.abort();
    await expect(drawingExport(core, { ids: ['plate'], options }, run)).rejects.toThrow();
    expect(work.build.mock.calls).toHaveLength(calls);
  });

  it('sends only selected records to preparation with the full source identity', async () => {
    const { core, run } = context();

    core.parts.push(sheetPart({ id: 'unrelated' }));
    work.build.mockResolvedValueOnce({ bytes: new Uint8Array([1]) });
    await drawingExport(core, { ids: ['plate'], options }, run);
    expect(work.build.mock.lastCall?.[1].parts.map((part: { id: string }) => part.id)).toEqual(['plate']);
    expect(work.build.mock.lastCall?.[1].source).toMatchObject({ id: 'rover', name: 'rover' });
  });
});
