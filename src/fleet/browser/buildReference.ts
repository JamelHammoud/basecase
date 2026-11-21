import { fleetRequest, type RegistryItem } from './client';
import { buildEvidence, type FleetBuildEvidence, type FleetBuildReference } from '../buildReference';

export async function linkBuildReference(
  organization: string,
  robot: string,
  proposed: FleetBuildEvidence,
): Promise<FleetBuildReference> {
  const evidence = buildEvidence(proposed);
  const current = await fleetRequest<RegistryItem>(`${organization}/robot/${robot}`);

  if (current.id !== robot) throw new Error('Fleet request refused');

  await fleetRequest(`${organization}/robot/${robot}`, {
    method: 'PUT',
    body: JSON.stringify({ buildRepair: evidence }),
  });

  return { ...evidence, format: 'basecase-fleet-build-reference', organization, robot };
}
