import { isHash } from '../skills/hash';

export interface FleetBuildEvidence {
  build: string;
  repair: string;
  source: string;
  target: string;
}
export interface FleetBuildReference extends FleetBuildEvidence {
  format: 'basecase-fleet-build-reference';
  organization: string;
  robot: string;
}

const uuid = (value: unknown) =>
  typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value);

export function buildEvidence(value: unknown): FleetBuildEvidence {
  const evidence = value as FleetBuildEvidence;

  if (
    !evidence ||
    !uuid(evidence.build) ||
    !uuid(evidence.repair) ||
    !isHash(evidence.source) ||
    !isHash(evidence.target)
  )
    throw new Error('Choose a build repair reference.');

  return { build: evidence.build, repair: evidence.repair, source: evidence.source, target: evidence.target };
}

export function fleetBuildReference(value: unknown): FleetBuildReference {
  const reference = value as FleetBuildReference;
  const evidence = buildEvidence(reference);

  if (reference.format !== 'basecase-fleet-build-reference' || !uuid(reference.organization) || !uuid(reference.robot))
    throw new Error('Choose a Fleet build reference.');

  return { ...evidence, format: reference.format, organization: reference.organization, robot: reference.robot };
}

export function buildEvidenceFragment(evidence: FleetBuildEvidence) {
  return new URLSearchParams({ buildRepair: JSON.stringify(buildEvidence(evidence)) }).toString();
}

export function evidenceFromFragment(fragment: string): FleetBuildEvidence | null {
  try {
    const value = new URLSearchParams(fragment.replace(/^#/, '')).get('buildRepair');

    return value && value.length <= 1024 ? buildEvidence(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}
