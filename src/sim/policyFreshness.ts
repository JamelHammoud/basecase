import type { PolicyRecord } from '../types/robotics';
import { SIM_MODEL_VERSION } from './mjcfTypes';

export const isStalePolicy = (record: Pick<PolicyRecord, 'modelVersion'>) =>
  (record.modelVersion ?? 0) !== SIM_MODEL_VERSION;
