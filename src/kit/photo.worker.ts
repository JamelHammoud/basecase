import { serve, reply } from '../utils/workerRpc';
import { prepareBuildPhoto, verifyBuildPhoto, type BuildPhotoImage } from './photoImage';

serve({
  prepare: async (input: Blob) => reply(await prepareBuildPhoto(input)),
  verify: async (input: BuildPhotoImage) => reply(await verifyBuildPhoto(input)),
});
