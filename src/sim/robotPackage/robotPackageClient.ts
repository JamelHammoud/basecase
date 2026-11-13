import type { ScenePart } from '../../types/robotics';
import { workerClient } from '../../utils/workerRpc';
import type { RobotPackageJob } from './buildRobotPackage';

type PackageHandlers = { build: (job: RobotPackageJob) => Promise<{ result: Uint8Array }> };

const localHandlers = async (): Promise<PackageHandlers> => {
  const { buildRobotPackage } = await import('./buildRobotPackage');

  return { build: async (job) => ({ result: buildRobotPackage(job) }) };
};

const client = workerClient<PackageHandlers>(
  () => new Worker(new URL('./robotPackage.worker.ts', import.meta.url), { type: 'module' }),
  localHandlers,
);

const withoutMeshes = ({ mesh: _mesh, cad: _cad, ...part }: ScenePart): ScenePart => part;

export function exportRobotPackageZip(job: RobotPackageJob): Promise<Uint8Array> {
  return client.call('build', { ...job, parts: job.parts.map(withoutMeshes) });
}
