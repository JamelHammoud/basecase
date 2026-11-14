import { workerClient } from '../utils/workerRpc';
import type { CutFileItem } from './cutFileExport';

type CutHandlers = { build: (items: CutFileItem[]) => Promise<{ result: Uint8Array }> };

const localHandlers = async (): Promise<CutHandlers> => {
  const { exportCutFiles } = await import('../sheet/cutFiles');

  return { build: async (items) => ({ result: exportCutFiles(items) }) };
};

const client = workerClient<CutHandlers>(
  () => new Worker(new URL('./cutFiles.worker.ts', import.meta.url), { type: 'module' }),
  localHandlers,
);

export const cutFilesZip = (items: CutFileItem[]): Promise<Uint8Array> => client.call('build', items);
