import { isUnitName } from '../../../electron/robot/units.mjs';
import type { CaseRobot, CaseResult } from '../runCase';
import type { Case } from '../schema';
import { hashOf, isHash, sha256Hex } from '../../skills/hash';
import { readWorkbenchPose, type WorkbenchPose } from './placement';
import { asBoolean, asId, asNumber, asRecord, asString, listOf, oneOf } from '../validate';

export interface PlacementIdentity {
  unit: string;
  caseId: string;
  caseHash: string;
  robotHash: string;
  pose: WorkbenchPose;
  fingerprint: string;
}

export interface RetainedPlacement extends PlacementIdentity {
  evidence: 'entered';
  rehearsalHash?: string;
  rehearsal?: Pick<CaseResult, 'passed' | 'margin' | 'failed' | 'refusal'> & { travelMm?: number };
}

export type PlacementUpdate = (placements: RetainedPlacement[] | undefined) => RetainedPlacement[];

const MAX_PLACEMENTS = 128;

const caseRevisions = new WeakMap<Case, string>();
const placementLists = new WeakMap<object, RetainedPlacement[]>();

export function caseRevision(kase: Case): string {
  const known = caseRevisions.get(kase);

  if (known) return known;

  const revision = hashOf(kase);

  caseRevisions.set(kase, revision);

  return revision;
}

function readPlacement(value: unknown, where: string): RetainedPlacement {
  const record = asRecord(value, where);
  const unit = asString(record.unit, where);

  if (!isUnitName(unit) || !isHash(record.caseHash) || !isHash(record.robotHash)) throw new Error(where);

  const source = {
    unit,
    caseId: asId(record.caseId, where),
    caseHash: record.caseHash,
    robotHash: record.robotHash,
    pose: readWorkbenchPose(record.pose),
  };

  if (hashOf(source) !== record.fingerprint) throw new Error(where);

  const rehearsal = record.rehearsal === undefined ? undefined : readRehearsal(record.rehearsal, where);

  if (rehearsal && hashOf({ fingerprint: record.fingerprint, rehearsal }) !== record.rehearsalHash)
    throw new Error(where);

  return {
    ...source,
    fingerprint: record.fingerprint as string,
    evidence: oneOf(['entered'] as const)(record.evidence, where),
    ...(rehearsal
      ? {
          rehearsal,
          rehearsalHash: record.rehearsalHash as string,
        }
      : {}),
  };
}

function readRehearsal(value: unknown, where: string): RetainedPlacement['rehearsal'] {
  const rehearsal = asRecord(value, where);

  return {
    passed: asBoolean(rehearsal.passed, where),
    margin: asNumber(rehearsal.margin, where),
    failed: listOf(asString, 16)(rehearsal.failed, where),
    ...(rehearsal.refusal === undefined ? {} : { refusal: asString(rehearsal.refusal, where) }),
    ...(rehearsal.travelMm === undefined ? {} : { travelMm: asNumber(rehearsal.travelMm, where) }),
  };
}

export function readPlacements(value: unknown): RetainedPlacement[] {
  const known = typeof value === 'object' && value !== null ? placementLists.get(value) : undefined;

  if (known) return known;

  try {
    const records = listOf(readPlacement, MAX_PLACEMENTS)(value ?? [], 'Workbench placements');

    if (typeof value === 'object' && value !== null) placementLists.set(value, records);

    return records;
  } catch {
    return [];
  }
}

export function updatedPlacements(value: unknown, record: RetainedPlacement): RetainedPlacement[] {
  const others = readPlacements(value).filter((own) => own.unit !== record.unit || own.caseId !== record.caseId);

  if (others.length >= MAX_PLACEMENTS)
    throw new Error('This scene has 128 workbench placements. Start another scene to add more.');

  return [...others, record];
}

export function placementIdentity(input: {
  unit: string;
  kase: Case;
  robot: CaseRobot;
  pose: WorkbenchPose;
}): PlacementIdentity {
  const { unit, kase, robot } = input;

  if (!isUnitName(unit))
    throw new Error('Use 1 to 32 lowercase letters, numbers or hyphens. Start with a letter or number.');

  const pose = readWorkbenchPose(input.pose);
  const caseHash = caseRevision(kase);
  const robotHash = hashOf({
    parts: robot.parts,
    joints: robot.joints,
    measures: robot.measures,
    selfContact: robot.selfContact,
    servoVolts: robot.servoVolts,
    triangles: robot.parts.map((part) => {
      const triangles = robot.partTriangles(part.id);

      return [
        part.id,
        triangles ? sha256Hex(new Uint8Array(triangles.buffer, triangles.byteOffset, triangles.byteLength)) : null,
      ];
    }),
  });
  const source = { unit, caseId: kase.id, caseHash, robotHash, pose };

  return { ...source, fingerprint: hashOf(source) };
}

export function retainPlacement(
  identity: PlacementIdentity,
  rehearsal?: RetainedPlacement['rehearsal'],
): RetainedPlacement {
  return {
    ...structuredClone(identity),
    evidence: 'entered',
    ...(rehearsal
      ? {
          rehearsal: structuredClone(rehearsal),
          rehearsalHash: hashOf({ fingerprint: identity.fingerprint, rehearsal }),
        }
      : {}),
  };
}

export function currentPlacement(
  records: readonly RetainedPlacement[],
  identity: PlacementIdentity,
): RetainedPlacement | null {
  return (
    readPlacements(records).find(
      (record) =>
        record.unit === identity.unit &&
        record.caseId === identity.caseId &&
        record.fingerprint === identity.fingerprint &&
        hashOf({
          unit: record.unit,
          caseId: record.caseId,
          caseHash: record.caseHash,
          robotHash: record.robotHash,
          pose: record.pose,
        }) === record.fingerprint,
    ) ?? null
  );
}
