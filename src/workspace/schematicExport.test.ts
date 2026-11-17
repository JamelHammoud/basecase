import { describe, expect, it, vi } from 'vitest';
import { so101 } from '../wiring/fixtures';
import type { WorkspaceCore } from './useWorkspaceCore';
import { schematicExport } from './schematicExport';
import { defineBoard } from '../wiring/boardDefinition';

const work = vi.hoisted(() => ({ build: vi.fn(), dispose: vi.fn() }));

vi.mock('../wiring/electricalClient', () => ({
  electricalClient: () => ({ call: work.build, dispose: work.dispose }),
}));

function context() {
  const scene = so101();
  const core = {
    ...scene,
    scene: { sceneName: 'arm', sceneId: 'arm' },
    docs: { partsRef: { current: scene.parts }, projectRef: { current: scene.project } },
  } as unknown as WorkspaceCore;
  const controller = new AbortController();

  return { core, controller, run: { current: () => core, signal: controller.signal } };
}

describe('schematic preparation', () => {
  it.each(['parts', 'supply', 'scene'])(
    'rejects %s edits during preparation without modifying the original parts',
    async (edit) => {
      const { core, run } = context();
      const original = structuredClone(core.parts);

      work.build.mockImplementationOnce(async () => {
        if (edit === 'parts') core.docs.partsRef.current = core.parts.map((part) => ({ ...part, name: 'Changed' }));

        if (edit === 'supply') core.docs.projectRef.current = { ...core.project, tether: { volts: 12, amps: 1 } };

        if (edit === 'scene') core.scene.sceneId = 'other-scene';

        return { bytes: new Uint8Array([1]), sourceFingerprint: 'old' };
      });
      await expect(schematicExport(core, run)).rejects.toThrow('The scene changed');
      expect(core.parts).toEqual(original);
      expect(work.dispose).toHaveBeenCalled();
    },
  );

  it('rejects cancellation before starting a worker job', async () => {
    const { core, run, controller } = context();
    const calls = work.build.mock.calls.length;

    controller.abort();
    await expect(schematicExport(core, run)).rejects.toThrow();
    expect(work.build.mock.calls).toHaveLength(calls);
  });

  it.each(['cancel', 'placement'] as const)(
    'rejects %s during board preparation without delivering stale bytes',
    async (fault) => {
      const { core, run, controller } = context();
      const { board, part } = defineBoard(core, 'board');

      core.parts = [...core.parts, part];
      core.project = { ...core.project, electronicsBoard: board };
      core.docs.partsRef.current = core.parts;
      core.docs.projectRef.current = core.project;
      work.build.mockImplementationOnce(async () => {
        if (fault === 'cancel') controller.abort();

        if (fault === 'placement')
          core.docs.projectRef.current = {
            ...core.project,
            electronicsBoard: { ...board, edgeClearanceMm: board.edgeClearanceMm + 1 },
          };

        return { bytes: new Uint8Array([1]), sourceFingerprint: 'old' };
      });

      await expect(schematicExport(core, run)).rejects.toThrow();
      expect(work.dispose).toHaveBeenCalled();
      expect(core.project.electronicsBoard).toEqual(board);
    },
  );
});
