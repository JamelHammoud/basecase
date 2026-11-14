import type { ScenePart } from '../../types/robotics';
import { workerClient } from '../../utils/workerRpc';
import type { RobotPackageJob } from './buildRobotPackage';
import type { JointMap, JointMapInput } from './jointMap';

type PackageHandlers = {
  build: (job: RobotPackageJob) => Promise<{ result: Uint8Array }>;
  jointMap: (input: JointMapInput) => Promise<{ result: JointMap }>;
};

const localHandlers = async (): Promise<PackageHandlers> => {
  const { buildRobotPackage } = await import('./buildRobotPackage');
  const { jointMap } = await import('./jointMap');

  return {
    build: async (job) => ({ result: buildRobotPackage(job) }),
    jointMap: async (input) => ({ result: jointMap(input) }),
  };
};

const client = workerClient<PackageHandlers>(
  () => new Worker(new URL('./robotPackage.worker.ts', import.meta.url), { type: 'module' }),
  localHandlers,
);

const withoutMeshes = ({ mesh: _mesh, cad: _cad, ...part }: ScenePart): ScenePart => part;

export function exportRobotPackageZip(job: RobotPackageJob): Promise<Uint8Array> {
  return client.call('build', { ...job, parts: job.parts.map(withoutMeshes) });
}

export function exportRobotJointMap(input: JointMapInput): Promise<JointMap> {
  return client.call('jointMap', { ...input, parts: input.parts.map(withoutMeshes) });
}
