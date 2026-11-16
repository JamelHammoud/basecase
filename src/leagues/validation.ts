import { COMPONENT_BY_ID } from '../data/components';
import { parseCase } from '../cases/schema';
import { asId, asNumber, asRecord, asString, oneOf, refuse } from '../cases/validate';
import { readGalleryBundleBytes, readMesh, type GalleryBundle } from '../gallery/galleryBundle';
import { sharedRepo } from '../gallery/galleryLinks';
import { hashOf, isHash, sha256Hex } from '../skills/hash';
import type { LeagueEntry, LeagueManifest } from './types';

export const hashValue = hashOf;
export const hashBytes = sha256Hex;
export const LEAGUE_RUNNER_VERSION = 'league-case-v1';

export const LEAGUE_ENTRIES_MAX = 100;
export const LEAGUE_SEEDS_MAX = 32;
export const LEAGUE_JSON_MAX = 2 * 1024 * 1024;

export function leagueHash(value: unknown, where: string): string {
  return isHash(value) ? value : refuse(where, 'needs a SHA-256 hash');
}

export function leagueRevision(value: unknown): string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)
    ? value
    : refuse('League revision', 'needs a commit');
}

export function leagueTime(value: unknown): string {
  const time = asString(value, 'League time');

  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(time) &&
    Number.isFinite(Date.parse(time))
    ? time
    : refuse('League time', 'needs an absolute date');
}

export function validateManifest(input: unknown): LeagueManifest {
  const v = asRecord(input, 'League');
  const engine = asRecord(v.engine, 'League engine');
  const ranking = asRecord(v.ranking, 'League ranking');
  const seedCount = asNumber(v.seedCount, 'League seeds');

  if (v.formatVersion !== 1 || !Number.isInteger(seedCount) || seedCount < 1 || seedCount > LEAGUE_SEEDS_MAX)
    return refuse('League', 'has unsupported limits');

  return {
    formatVersion: 1,
    id: asId(v.id, 'League id'),
    title: asString(v.title, 'League title'),
    deadline: leagueTime(v.deadline),
    case: parseCase(v.case),
    caseHash: leagueHash(v.caseHash, 'League Case'),
    contractHash: leagueHash(v.contractHash, 'League contract'),
    engine: { mujoco: asString(engine.mujoco, 'MuJoCo'), runner: asString(engine.runner, 'League runner') },
    ranking: {
      score: oneOf(['margin', 'score'])(ranking.score, 'League score'),
      direction: oneOf(['higher', 'lower'])(ranking.direction, 'League direction'),
    },
    seedCount,
  };
}

export function validateEntry(input: unknown): LeagueEntry {
  const v = asRecord(input, 'League entry');
  const repo = asString(v.repo, 'League repo');
  const id = asId(v.id, 'League entry id');

  if (id === '.' || id === '..') return refuse('League entry id', 'needs a filename');

  const budget = v.budget === null ? null : asNumber(v.budget, 'League Budget');

  if (!sharedRepo(repo) || (budget !== null && budget < 0)) return refuse('League entry', 'has unsupported values');

  return {
    id,
    ...(v.robotName === undefined ? {} : { robotName: asString(v.robotName, 'League robot name') }),
    repo,
    revision: leagueRevision(v.revision),
    bundleHash: leagueHash(v.bundleHash, 'League bundle'),
    enteredAt: leagueTime(v.enteredAt),
    budget,
  };
}

export function verifyManifest(manifest: LeagueManifest): void {
  if (hashValue(manifest.case.task.contract) !== manifest.contractHash) refuse('League contract', 'does not match');

  if (hashValue(manifest.case) !== manifest.caseHash) refuse('League Case', 'does not match');

  if (manifest.ranking.score === 'score' && !manifest.case.task.score) refuse('League score', 'has no measurement');

  supportedCase(manifest.case);
}

export function supportedCase(kase: LeagueManifest['case']): void {
  if (kase.logic || kase.console?.panels.some((panel) => panel.kind === 'code') || kase.world.imported)
    refuse('League Case', 'contains unsupported executable or imported content');
}

export function verifyEntryBundle(manifest: LeagueManifest, entry: LeagueEntry, bytes: Uint8Array): GalleryBundle {
  validateEntry(entry);
  verifyManifest(manifest);

  if (Date.parse(entry.enteredAt) > Date.parse(manifest.deadline)) refuse('League entry', 'missed the deadline');

  if (hashBytes(bytes) !== entry.bundleHash) refuse('League bundle', 'does not match');

  const bundle = readGalleryBundleBytes(bytes);

  if (hashValue(bundle.case.task.contract) !== manifest.contractHash) refuse('League contract', 'does not match');

  if (hashValue(bundle.case) !== manifest.caseHash) refuse('League Case', 'does not match');

  supportedCase(bundle.case);

  if (entry.robotName !== undefined && entry.robotName !== bundle.robot.name)
    refuse('League robot name', 'does not match');

  if (bundle.trained?.kind === 'skill' && bundle.trained.skill.controller.kind !== 'policy')
    refuse('League policy', 'uses an unsupported controller');

  const safe = new Set([
    'box',
    'cube',
    'sphere',
    'cylinder',
    'tube',
    'torus',
    'pyramid',
    'hex_prism',
    'capsule',
    'dome',
    'cone',
    'wedge',
    'mesh',
    'cad_part',
    'component',
    'hardware',
  ]);

  for (const part of bundle.robot.parts) {
    if (part.kind === 'cad_part') readMesh(part.cad, 'League baked CAD');
  }

  if (
    bundle.robot.parts.some(
      (part) =>
        !safe.has(part.kind) ||
        part.mesh?.file ||
        part.mesh?.visual ||
        (part.kind === 'component' && (!part.componentId || !Object.hasOwn(COMPONENT_BY_ID, part.componentId))),
    )
  )
    refuse('League robot', 'contains unsupported executable or external content');

  return bundle;
}
