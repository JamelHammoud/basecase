import { buildKit } from './buildKit';
import { electricalKitFiles } from './electrical';
import { electricalKitJob } from './electrical.fixtures';
import type { ElectricalInput } from '../wiring/electricalTypes';
import type { BoardNativeResult } from '../wiring/boardRoutingTypes';
import type { PreparedBoardExport } from '../wiring/boardRoutingPackage';

export async function nativeKitFixture(
  input: ElectricalInput,
  prepared: PreparedBoardExport,
  result: BoardNativeResult,
) {
  const job = await electricalKitJob('dual-bus-arm', input);

  job.purchases = { 'component:jst-b3b-eh-a': { onHand: 1 } };
  job.electrical = await electricalKitFiles({ prepared, result, designFingerprint: job.designFingerprint! });

  return buildKit(job);
}
