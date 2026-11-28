import { createElement, useEffect } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { cadPartsFromFile } from './cadImport';
import { meshPartsFromFile } from './meshImport';
import { useMeshImport } from './useMeshImport';
import type { WorkspaceCore } from './useWorkspaceCore';

vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()), useEffect: vi.fn() }));
vi.mock('./cadImport', () => ({ cadPartsFromFile: vi.fn() }));
vi.mock('./meshImport', () => ({ meshPartsFromFile: vi.fn() }));

afterEach(() => vi.resetAllMocks());

const part = (id: string) => ({ id }) as ScenePart;

function decodedParts() {
  let resolve!: (parts: ScenePart[]) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ScenePart[]>((done, fail) => {
    resolve = done;
    reject = fail;
  });

  return { promise, resolve, reject };
}

function session() {
  let parts = [part('existing')];
  let toastId = 0;
  const showToast = vi.fn(() => ++toastId);
  const core = {
    active: true,
    scene: { sceneId: 'origin' },
    docs: {
      commitParts: vi.fn((update: (previous: ScenePart[]) => ScenePart[]) => {
        parts = update(parts);
      }),
    },
    setSelectedIds: vi.fn(),
    tool: { setTransformMode: vi.fn() },
    showToast,
    toasts: { showToast, dismissToast: vi.fn() },
  };
  let importer!: ReturnType<typeof useMeshImport>;

  function Host() {
    importer = useMeshImport(core as unknown as WorkspaceCore);

    return null;
  }

  renderToStaticMarkup(createElement(Host));

  const close = vi.mocked(useEffect).mock.lastCall![0]()!;

  return { core, importer, close, parts: () => parts };
}

it.each(['stl', 'step'])('discards a delayed %s result after replacing the scene', async (extension) => {
  const decoded = decodedParts();

  vi.mocked(meshPartsFromFile).mockReturnValue(decoded.promise);
  vi.mocked(cadPartsFromFile).mockReturnValue(decoded.promise);

  const fixture = session();
  const importing = fixture.importer.importMeshes([new File(['mesh'], `plate.${extension}`)]);

  fixture.core.scene.sceneId = 'replacement';
  decoded.resolve([part('late')]);
  await importing;
  expect(fixture.parts().map((entry) => entry.id)).toEqual(['existing']);
  expect(fixture.core.docs.commitParts).not.toHaveBeenCalled();
  expect(fixture.core.setSelectedIds).not.toHaveBeenCalled();
  expect(fixture.core.tool.setTransformMode).not.toHaveBeenCalled();
  expect(fixture.core.toasts.dismissToast).toHaveBeenCalledWith(1);
});

it.each(['unmounted', 'returned'] as const)('retires an import when its workspace is %s', async (state) => {
  const decoded = decodedParts();

  vi.mocked(meshPartsFromFile).mockReturnValue(decoded.promise);

  const fixture = session();
  const importing = fixture.importer.importMeshes([new File(['mesh'], 'plate.stl')]);

  fixture.close();

  if (state === 'returned') vi.mocked(useEffect).mock.lastCall![0]();

  decoded.resolve([part('late')]);
  await importing;
  expect(fixture.core.docs.commitParts).not.toHaveBeenCalled();
  expect(fixture.core.showToast).toHaveBeenCalledTimes(1);

  expect(fixture.core.toasts.dismissToast).toHaveBeenCalledWith(1);
});

it('does not report an old failure or dismiss a replacement scene toast', async () => {
  const decoded = decodedParts();

  vi.mocked(meshPartsFromFile).mockReturnValue(decoded.promise);

  const fixture = session();
  const importing = fixture.importer.importMeshes([new File(['mesh'], 'plate.stl')]);

  fixture.core.scene.sceneId = 'replacement';
  decoded.reject(new Error('Old parser failure'));
  await importing;
  expect(fixture.core.showToast).toHaveBeenCalledTimes(1);
  expect(fixture.core.toasts.dismissToast).toHaveBeenCalledWith(1);
});

it('preserves concurrent imports and edits within the originating scene', async () => {
  const first = decodedParts();
  const second = decodedParts();

  vi.mocked(meshPartsFromFile).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

  const fixture = session();
  const importingFirst = fixture.importer.importMeshes([new File(['mesh'], 'first.stl')]);
  const importingSecond = fixture.importer.importMeshes([new File(['mesh'], 'second.stl')]);

  fixture.core.docs.commitParts((previous) => [...previous, part('edit')]);
  second.resolve([part('second')]);
  await importingSecond;
  first.resolve([part('first')]);
  await importingFirst;
  expect(fixture.parts().map((entry) => entry.id)).toEqual(['existing', 'edit', 'second', 'first']);
  expect(fixture.core.setSelectedIds.mock.calls).toEqual([[['second']], [['first']]]);
  expect(fixture.core.toasts.dismissToast).toHaveBeenCalledTimes(2);
  expect(fixture.core.toasts.dismissToast.mock.calls).toEqual([[2], [1]]);
});

it('retains batch placement, resource files and partial failure reporting', async () => {
  vi.mocked(meshPartsFromFile).mockResolvedValue([part('mesh')]);
  vi.mocked(cadPartsFromFile).mockRejectedValue(new Error('Unsupported CAD body'));

  const fixture = session();
  const resources = [new File(['buffer'], 'material.bin')];
  const files = [new File(['mesh'], 'plate.stl'), new File(['cad'], 'plate.step')];

  await fixture.importer.importMeshes(files, [10, 20, 30], resources);
  expect(vi.mocked(meshPartsFromFile).mock.calls[0][0]).toMatchObject({ file: files[0], resources, at: [10, 20, 30] });
  expect(vi.mocked(cadPartsFromFile).mock.calls[0][0]).toMatchObject({ file: files[1], at: [50, 20, 30] });
  expect(fixture.parts().map((entry) => entry.id)).toEqual(['existing', 'mesh']);
  expect(fixture.core.showToast).toHaveBeenLastCalledWith(expect.stringContaining('Unsupported CAD body'), {
    tone: 'error',
  });
});

it('keeps a valid import in its originating background tab', async () => {
  const decoded = decodedParts();

  vi.mocked(meshPartsFromFile).mockReturnValue(decoded.promise);

  const fixture = session();
  const importing = fixture.importer.importMeshes([new File(['mesh'], 'plate.stl')]);

  fixture.core.active = false;
  decoded.resolve([part('background')]);
  await importing;
  expect(fixture.parts().map((entry) => entry.id)).toEqual(['existing', 'background']);
  expect(fixture.core.setSelectedIds).toHaveBeenCalledWith(['background']);
  expect(fixture.core.toasts.dismissToast).toHaveBeenCalledWith(1);
});

it('does not start an empty import', async () => {
  const fixture = session();

  await fixture.importer.importMeshes([]);
  expect(meshPartsFromFile).not.toHaveBeenCalled();
  expect(fixture.core.showToast).not.toHaveBeenCalled();
});

it('does not start a late file-picker callback after workspace disposal', async () => {
  const fixture = session();

  fixture.close();
  await fixture.importer.importMeshes([new File(['mesh'], 'late.stl')]);
  expect(meshPartsFromFile).not.toHaveBeenCalled();
  expect(fixture.core.docs.commitParts).not.toHaveBeenCalled();
  expect(fixture.core.showToast).not.toHaveBeenCalled();
});
