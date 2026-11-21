import { provideMeshFiles } from '../three/componentMeshes';
import { exportTryArchive, importTryArchive, isTryArchiveName } from '../cases/tryArchive';
import { MAX_UNPACKED_BYTES } from '../utils/robotImport/archive';
import { TRY_FILE_ERROR, TRY_FILE_LIMIT } from '../cases/tryArchiveJobs';
import { downloadBytes } from '../utils/downloadBytes';
import { errorMessage } from '../utils/errorMessage';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { TryTimeline } from './useTryTimeline';

export const canExportTry = (timeline: TryTimeline) =>
  timeline.open &&
  !timeline.comparison.active &&
  !!timeline.record &&
  !!(timeline.record.manifest.branch || timeline.recording?.continuation || timeline.recording?.evaluation);

export async function exportTimelineTry(core: WorkspaceCore) {
  const timeline = core.simTraining.cases.timeline;

  if (!canExportTry(timeline)) return;

  try {
    const bytes = await exportTryArchive(timeline.record!.id);

    downloadBytes(bytes, `${timeline.record!.id}.tries.zip`, 'application/zip');
  } catch (error) {
    core.showToast(errorMessage(error), { tone: 'error' });
  }
}

export function importTryFiles(core: WorkspaceCore, files: File[]): boolean {
  const archives = files.filter((file) => isTryArchiveName(file.name));

  if (!archives.length) return false;

  if (archives.length !== files.length) {
    core.showToast(TRY_FILE_ERROR, { tone: 'error' });

    return true;
  }

  const run = async () => {
    core.simTraining.cases.attempt.cancelBranch();
    core.simTraining.cases.timeline.close();

    for (const file of archives) {
      if (file.size > MAX_UNPACKED_BYTES) throw new Error(TRY_FILE_LIMIT);

      const entries = await importTryArchive(new Uint8Array(await file.arrayBuffer()));
      const source = entries.find((entry) => entry.recording.evaluation)?.recording.evaluation;

      if (source) await openEvaluationScene(core, source);
    }

    core.simTraining.triesPlaces.setPlace({ open: true, robot: null, dataset: null });
  };

  void run().catch((error: unknown) => core.showToast(errorMessage(error), { tone: 'error' }));

  return true;
}

async function openEvaluationScene(
  core: WorkspaceCore,
  source: import('../cases/evaluationReplayValidation').EvaluationReplay,
) {
  provideMeshFiles(Object.fromEntries(Object.entries(source.meshes).map(([id, bytes]) => [id, bytes.slice().buffer])));
  await core.studio.importSceneFile(new File([source.scene.slice().buffer], `${source.revision}.basecase`));
}
