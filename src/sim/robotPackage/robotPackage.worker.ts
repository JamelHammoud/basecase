/// <reference lib="webworker" />
import { reply, serve } from '../../utils/workerRpc';
import { buildRobotPackage, type RobotPackageJob } from './buildRobotPackage';

serve({
  build: (job: RobotPackageJob) => {
    const zip = buildRobotPackage(job);

    return reply(zip, [zip.buffer]);
  },
});
