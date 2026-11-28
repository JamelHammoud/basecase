import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { ImportActivation } from '../roboflow/importActivation';
import { roboflowImportSource } from '../roboflow/roboflowBridge';
import { openDataImport } from '../datasets/import/dataImportClient';
import { keepImportedImages } from '../datasets/import/keepImportedImages';
import { useDataImport } from './useDataImport';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { RobotInsert } from './useRobotInsert';

vi.mock('../roboflow/roboflowBridge', () => ({ roboflowImportSource: vi.fn() }));
vi.mock('../datasets/import/dataImportClient', () => ({ openDataImport: vi.fn() }));
vi.mock('../datasets/import/keepImportedImages', () => ({ keepImportedImages: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

function harness() {
  const read = vi.fn().mockResolvedValue({ images: {}, episodes: 0 });
  const close = vi.fn();
  const openDataset = vi.fn();
  const core = {
    scene: { sceneId: 'original' },
    docs: {},
    showToast: vi.fn(),
    toasts: { dismissToast: vi.fn() },
    studio: { openSettings: vi.fn() },
    triesView: { openDataset },
    simTraining: { cases: { active: null } },
  } as unknown as WorkspaceCore;
  let data!: ReturnType<typeof useDataImport>;

  vi.mocked(openDataImport).mockReturnValue({ read, close } as unknown as ReturnType<typeof openDataImport>);
  vi.mocked(keepImportedImages).mockResolvedValue({ dataset: { id: 'dataset' }, added: true } as Awaited<
    ReturnType<typeof keepImportedImages>
  >);

  function Harness() {
    data = useDataImport(core, {} as RobotInsert);

    return null;
  }

  renderToString(createElement(Harness));

  return { data, read, close, openDataset, core };
}

it('never decodes or persists a pending reply', async () => {
  const { data, read, openDataset } = harness();
  const pending = {
    kind: 'pending',
    continuation: { workspace: 'workspace', project: 'project', version: 2, format: 'coco', signature: 'a'.repeat(64) },
  } as const;

  vi.mocked(roboflowImportSource).mockResolvedValue(pending);
  expect(await data.prepareRoboflow('https://app.roboflow.com/workspace/project', () => true)).toEqual(pending);
  expect(read).not.toHaveBeenCalled();
  expect(keepImportedImages).not.toHaveBeenCalled();
  expect(openDataset).not.toHaveBeenCalled();
});

it.each(['cancel', 'close', 'scene change'])('discards late archive bytes after %s', async () => {
  const { data, read, openDataset } = harness();
  const activation = new ImportActivation();
  let complete!: (value: { kind: 'zip'; name: string; blob: Blob }) => void;

  vi.mocked(roboflowImportSource).mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );

  const work = data.prepareRoboflow('https://app.roboflow.com/workspace/project', activation.start());

  activation.cancel();
  complete({ kind: 'zip', name: 'project-v2.zip', blob: new Blob() });
  await work;
  expect(read).not.toHaveBeenCalled();
  expect(keepImportedImages).not.toHaveBeenCalled();
  expect(openDataset).not.toHaveBeenCalled();
});

it('discards an archive decoded after cancellation', async () => {
  const { data, read, close, openDataset, core } = harness();
  const activation = new ImportActivation();
  let complete!: (value: unknown) => void;
  let reading!: () => void;
  const started = new Promise<void>((resolve) => {
    reading = resolve;
  });

  vi.mocked(roboflowImportSource).mockResolvedValue({ kind: 'zip', name: 'project-v2.zip', blob: new Blob() });
  read.mockImplementation(() => {
    reading();

    return new Promise((resolve) => {
      complete = resolve;
    });
  });

  const work = data.prepareRoboflow('https://app.roboflow.com/workspace/project', activation.start());

  await started;
  expect(read).toHaveBeenCalledOnce();
  activation.cancel();
  complete({ images: {}, episodes: 0 });
  await work;
  expect(keepImportedImages).not.toHaveBeenCalled();
  expect(openDataset).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
  expect(core.showToast).not.toHaveBeenCalled();
});

it('keeps an in-flight dataset write in its original scene without opening it after cancellation', async () => {
  const { data, read, openDataset, core } = harness();
  const activation = new ImportActivation();
  let complete!: (value: Awaited<ReturnType<typeof keepImportedImages>>) => void;
  let writing!: () => void;
  const started = new Promise<void>((resolve) => {
    writing = resolve;
  });

  vi.mocked(roboflowImportSource).mockResolvedValue({ kind: 'zip', name: 'project-v2.zip', blob: new Blob() });
  vi.mocked(keepImportedImages).mockImplementation(() => {
    writing();

    return new Promise((resolve) => {
      complete = resolve;
    });
  });

  const work = data.prepareRoboflow('https://app.roboflow.com/workspace/project', activation.start());

  await started;
  expect(read).toHaveBeenCalledOnce();
  expect(keepImportedImages).toHaveBeenCalledWith(expect.anything(), {
    caseId: null,
    sceneId: 'original',
    objects: [],
  });
  activation.cancel();
  core.scene.sceneId = 'replacement';
  complete({ dataset: { id: 'dataset' }, added: true } as Awaited<ReturnType<typeof keepImportedImages>>);
  await work;
  expect(openDataset).not.toHaveBeenCalled();
  expect(core.showToast).not.toHaveBeenCalled();
  expect(core.toasts.dismissToast).not.toHaveBeenCalled();
});
