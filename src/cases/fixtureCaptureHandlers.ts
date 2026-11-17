import { buildCase, type CaseSpec } from './caseBuilder';
import type { BuilderRobot } from './caseGoals';
import { reply } from '../utils/workerRpc';
import { captureCaseFixture } from './fixtureAssembly';
import type { RobotJoint, ScenePart } from '../types/robotics';

export interface FixtureCaptureJob {
  parts: ScenePart[];
  joints: RobotJoint[];
  name: string;
}

export const fixtureCaptureHandlers = {
  build: (job: { spec: CaseSpec; robot: BuilderRobot }) => reply(buildCase(job.spec, job.robot)),
  capture: async (job: FixtureCaptureJob) => reply(await captureCaseFixture(job)),
};
