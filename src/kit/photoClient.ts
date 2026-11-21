import { workerClient, reply } from '../utils/workerRpc';
import type { BuildPhotoImage } from './photoImage';

type PhotoHandlers = {
  prepare: (input: Blob) => Promise<{ result: BuildPhotoImage }>;
  verify: (input: BuildPhotoImage) => Promise<{ result: BuildPhotoImage }>;
};

export function photoClient() {
  return workerClient<PhotoHandlers>(
    () => new Worker(new URL('./photo.worker.ts', import.meta.url), { type: 'module' }),
    async () => {
      if (typeof document !== 'undefined') throw new Error('Photo import needs a worker.');

      const { prepareBuildPhoto, verifyBuildPhoto } = await import('./photoImage');

      return {
        prepare: async (input) => reply(await prepareBuildPhoto(input)),
        verify: async (input) => reply(await verifyBuildPhoto(input)),
      };
    },
  );
}
