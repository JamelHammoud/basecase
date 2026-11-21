import type { CaseCheckJob } from '../cases/caseCheckJob';

export async function pipelineHandlers(kind: string) {
  if (kind.includes('study')) return (await import('../study/studyHandlers')).createStudyHandlers();

  if (kind.includes('worldAssetRestore')) return (await import('../cases/worldAssetRestore')).worldAssetRestoreHandlers;

  if (kind.includes('files')) return (await import('./files')).classroomFiles;

  const { CaseCheckSession } = await import('../cases/caseCheckJob');
  const { default: loadMujoco } = await import('@mujoco/mujoco');
  const session = new CaseCheckSession();
  const module = loadMujoco();

  return { case: async (job: CaseCheckJob) => ({ result: await session.run(await module, job) }) };
}
