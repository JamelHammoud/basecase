import { reply, workerClient } from '../../utils/workerRpc';
import type { Recording } from '../../sim/recorder';
import type { BuiltTries, ReplayJob } from './importedTries';
import type { BuildJob, SourceSummary } from './dataImportJobs';
import { sourceTransfer, type ImportSource } from './readSource';

type ImportHandlers = {
  read: (source: ImportSource) => Promise<{ result: SourceSummary | null }>;
  build: (job: BuildJob) => Promise<{ result: BuiltTries }>;
  replay: (job: ReplayJob) => Promise<{ result: Recording }>;
};

async function localHandlers(): Promise<ImportHandlers> {
  const { importHandlers } = await import('./dataImportJobs');
  const handlers = importHandlers();

  return {
    read: async (source) => reply(await handlers.read(source)),
    build: async (job) => reply(await handlers.build(job)),
    replay: async (job) => reply(await handlers.replay(job)),
  };
}

export function openDataImport() {
  let local: Promise<ImportHandlers> | null = null;
  const client = workerClient<ImportHandlers>(
    () => new Worker(new URL('./dataImport.worker.ts', import.meta.url), { type: 'module' }),
    () => (local ??= localHandlers()),
  );

  return {
    read: (source: ImportSource) => client.call('read', source, sourceTransfer(source)),
    build: (job: BuildJob) => client.call('build', job),
    replay: (job: ReplayJob) => client.call('replay', job),
    close: () => client.dispose(),
  };
}

export type DataImportRun = ReturnType<typeof openDataImport>;
