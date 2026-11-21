import { caseSlots } from '../cases/schema';
import { classroomDesign, type ClassroomDesign } from './designSettings';
import { asId, asNumber, asRecord, asString, refuse } from '../cases/validate';
import { CASE_RUNS, seedsUpTo } from '../cases/caseRuns';
import { restoreWorldAssets } from '../cases/worldAssets';
import {
  galleryBundleBytes,
  parseGalleryBundle,
  readGalleryBundleBytes,
  type GalleryBundle,
} from '../gallery/galleryBundle';
import { hashOf } from '../skills/hash';
import { boundedData, boundedRobot } from './robotBounds';

export const CLASSROOM_MAX_BYTES = 8 * 1024 * 1024;
export const CLASSROOM_MAX_SUBMISSIONS = 30;
export const CLASSROOM_TOTAL_BYTES = 64 * 1024 * 1024;

export interface Assignment {
  format: 'basecase-assignment';
  version: 1;
  id: string;
  fingerprint: string;
  rubricRevision: 1;
  budgetUsd: number;
  seeds: number[];
  controller: 'reference';
  bundle: GalleryBundle;
  design: ClassroomDesign;
}

export interface Submission {
  format: 'basecase-submission';
  version: 1;
  assignmentId: string;
  assignmentFingerprint: string;
  fingerprint: string;
  name: string;
  bundle: GalleryBundle;
  design: ClassroomDesign;
}

export interface AssignmentContext {
  assignment: Assignment;
  name: string;
  inspection?: { check: string; ids: string[] };
}

export function classroomBytes(value: unknown): Uint8Array {
  const bytes = new TextEncoder().encode(JSON.stringify(value));

  if (bytes.length > CLASSROOM_MAX_BYTES) refuse('Classroom file', 'is too large.');

  return bytes;
}

function jsonOf(bytes: Uint8Array): Record<string, unknown> {
  if (bytes.length > CLASSROOM_MAX_BYTES) refuse('Classroom file', 'is too large.');

  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));

  boundedData(value);

  return asRecord(value, 'Classroom file');
}

const fingerprint = (value: Record<string, unknown>) => hashOf({ ...value, fingerprint: undefined });

const named = (value: unknown) => {
  const name = asString(value, 'Name').trim();

  if (!name || name.length > 80 || [...name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127))
    refuse('Name', 'needs 1 to 80 printable characters.');

  return name;
};

async function portable(bundle: GalleryBundle): Promise<GalleryBundle> {
  boundedData(bundle);

  const checked = boundedRobot(readGalleryBundleBytes(galleryBundleBytes(bundle)));

  await restoreWorldAssets(checked.worldAssets);

  return checked;
}

export async function assignmentOf(
  bundle: GalleryBundle,
  budgetUsd: number,
  id: string = crypto.randomUUID(),
  design?: ClassroomDesign,
): Promise<Assignment> {
  if (caseSlots(bundle.case).length !== 1) refuse('Assignment', 'needs one robot slot.');

  const value: Omit<Assignment, 'fingerprint'> = {
    format: 'basecase-assignment',
    version: 1,
    id: asId(id, 'Assignment'),
    rubricRevision: 1,
    design: classroomDesign(design),
    budgetUsd: asNumber(budgetUsd, 'Budget'),
    seeds: seedsUpTo(CASE_RUNS),
    controller: 'reference',
    bundle: await portable(bundle),
  };

  if (budgetUsd < 0 || budgetUsd > 1000000) refuse('Budget', 'must be between $0 and $1,000,000.');

  return { ...value, fingerprint: fingerprint(value) };
}

export async function readAssignment(bytes: Uint8Array): Promise<Assignment> {
  const v = jsonOf(bytes);

  if (
    v.format !== 'basecase-assignment' ||
    v.version !== 1 ||
    v.rubricRevision !== 1 ||
    v.controller !== 'reference' ||
    hashOf(v.seeds) !== hashOf(seedsUpTo(CASE_RUNS))
  )
    refuse('Assignment', 'needs a supported rubric and reference controller.');

  const result = await assignmentOf(
    parseGalleryBundle(v.bundle),
    asNumber(v.budgetUsd, 'Budget'),
    asId(v.id, 'Assignment'),
    classroomDesign(v.design),
  );

  if (result.fingerprint !== v.fingerprint) refuse('Assignment fingerprint', 'doesn’t match its content.');

  return result;
}

export async function submissionOf(
  assignment: Assignment,
  bundle: GalleryBundle,
  name: string,
  design: ClassroomDesign = assignment.design,
): Promise<Submission> {
  const value: Omit<Submission, 'fingerprint'> = {
    format: 'basecase-submission',
    version: 1,
    assignmentId: assignment.id,
    assignmentFingerprint: assignment.fingerprint,
    name: named(name),
    design: classroomDesign(design),
    bundle: await portable({ ...assignment.bundle, robot: bundle.robot, trained: undefined }),
  };

  return { ...value, fingerprint: fingerprint(value) };
}

export async function readSubmission(bytes: Uint8Array): Promise<Submission> {
  const v = jsonOf(bytes);

  if (v.format !== 'basecase-submission' || v.version !== 1) refuse('Submission', 'needs a supported format.');

  const result: Omit<Submission, 'fingerprint'> = {
    format: 'basecase-submission',
    version: 1,
    assignmentId: asId(v.assignmentId, 'Assignment'),
    assignmentFingerprint: asString(v.assignmentFingerprint, 'Assignment fingerprint'),
    name: named(v.name),
    design: classroomDesign(v.design),
    bundle: await portable(parseGalleryBundle(v.bundle)),
  };

  if (fingerprint(result) !== v.fingerprint) refuse('Submission fingerprint', 'doesn’t match its content.');

  return { ...result, fingerprint: fingerprint(result) };
}

export async function pinnedBundle(assignment: Assignment, submission: Submission): Promise<GalleryBundle> {
  if (assignment.id !== submission.assignmentId || assignment.fingerprint !== submission.assignmentFingerprint)
    refuse('Assignment revision', 'doesn’t match this submission.');

  return portable({ ...assignment.bundle, robot: submission.bundle.robot, trained: undefined });
}
