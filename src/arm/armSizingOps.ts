import { sizeArm, type ArmRequest, type ArmSizing } from '../utils/armSizing';
import { reply } from '../utils/workerRpc';

export const armSizingHandlers = {
  size: (request: ArmRequest) => reply<ArmSizing>(sizeArm(request)),
};
