/// <reference lib="webworker" />
import { reply, serve } from '../../utils/workerRpc';
import { buildRobotPackage, type RobotPackageJob } from './buildRobotPackage';
import { jointMap, type JointMapInput } from './jointMap';

serve({
  build: (job: RobotPackageJob) => {
    const zip = buildRobotPackage(job);

    return reply(zip, [zip.buffer]);
  },
  jointMap: (input: JointMapInput) => reply(jointMap(input)),
});
