import { sizeArm, type ArmSizing, type ArmSizingInput } from './armSizing';
import { reply } from './workerRpc';

export const armSizingHandlers = {
  size: (input: ArmSizingInput) => reply<ArmSizing>(sizeArm(input)),
};
