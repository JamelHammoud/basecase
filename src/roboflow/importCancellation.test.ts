import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { RoboflowAccount } from '../../electron/roboflow/index.mjs';
import { startFakeRoboflow } from '../../e2e/fakeRoboflow';
import { openDataImport } from '../datasets/import/dataImportClient';
import { useDataImport } from '../workspace/useDataImport';
import type { WorkspaceCore } from '../workspace/useWorkspaceCore';
import type { RobotInsert } from '../workspace/useRobotInsert';
import { ImportActivation } from './importActivation';

const { call } = vi.hoisted(() => ({ call: vi.fn() }));

vi.mock('../utils/platform/transport', () => ({ electron: () => ({ roboflowCall: call }) }));
vi.mock('../datasets/import/dataImportClient', () => ({ openDataImport: vi.fn() }));

it('discards a fake-server completion after the import activation is cancelled', async () => {
  const key = 'roboflow-test-private-key';
  const fake = await startFakeRoboflow({ key, exportReply: { status: 202, body: { progress: 25 } } });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roboflow-cancel-'));
  const rf = new RoboflowAccount({
    libraryDir: dir,
    secrets: { available: () => false, encrypt: (value) => value, decrypt: (value) => value },
    endpoint: () => fake.url,
  });
  const activation = new ImportActivation();
  const core = { docs: {}, toasts: {}, showToast: vi.fn(), studio: {} } as unknown as WorkspaceCore;
  let data!: ReturnType<typeof useDataImport>;
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });

  rf.keys.set('roboflow', key);
  call.mockImplementation((channel, input) =>
    channel === 'roboflow:account' ? rf.account() : rf.importProject(input),
  );

  function Harness() {
    data = useDataImport(core, {} as RobotInsert);

    return null;
  }

  renderToString(createElement(Harness));

  try {
    const pending = await data.prepareRoboflow('https://app.roboflow.com/workspace/project', activation.start());

    expect(pending?.kind).toBe('pending');
    expect(openDataImport).not.toHaveBeenCalled();
    fake.advance({
      exportReply: undefined,
      latest: 9,
      beforeExport: () => {
        started();

        return gate;
      },
    });

    const work = data.prepareRoboflow(pending!.continuation, activation.start());

    await requested;
    activation.cancel();
    release();
    await work;
    expect(fake.requests.map((request) => request.path)).toEqual([
      '/workspace/project',
      '/workspace/project/2/coco',
      '/workspace/project/2/coco',
      '/archive.zip',
    ]);
    expect(fake.requests.at(-1)?.key).toBeNull();
    expect(openDataImport).not.toHaveBeenCalled();
    expect(core.showToast).not.toHaveBeenCalled();
  } finally {
    release();
    await fake.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
