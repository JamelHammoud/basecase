import { reply, serve } from '../utils/workerRpc';
import { electricalProjection } from './electrical';
import { electricalPackage } from './electricalPackage';
import type { ElectricalInput } from './electricalTypes';

serve({
  inspect: (input: ElectricalInput) => {
    const { requirements, powerBudget } = electricalProjection(input);

    return reply({ requirements, powerBudget });
  },
  build: async (input: ElectricalInput) => {
    const { bytes, sourceFingerprint } = await electricalPackage(input);

    return reply({ bytes, sourceFingerprint }, [bytes.buffer]);
  },
});
