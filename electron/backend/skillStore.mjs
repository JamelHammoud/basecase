import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isSnapshotRef, readJsonOrNull, snapshotFile } from './trainingSnapshots.mjs';

const HASH = /^[0-9a-f]{64}$/;
const MAX_SKILL_BYTES = 32 * 1024 * 1024;
const SKILL_FORMAT = 'basecase-skill';
const MAX_KEPT_SNAPSHOTS = 12;

const checkedHash = (hash) => {
  if (typeof hash !== 'string' || !HASH.test(hash)) throw new Error('A skill is named by its hash.');

  return hash;
};

const skillFile = (libraryDir, hash) => path.join(libraryDir, 'skills', checkedHash(hash), 'skill.json');

function checkedSkill(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_SKILL_BYTES) throw new Error('The skill is too large.');

  const skill = JSON.parse(text);

  if (skill?.format !== SKILL_FORMAT) throw new Error('Not a Basecase skill.');

  return text;
}

export function saveSkill(libraryDir, { hash, text }) {
  const file = skillFile(libraryDir, hash);
  const body = checkedSkill(text);

  fs.mkdirSync(path.dirname(file), { recursive: true });

  const temp = `${file}.${crypto.randomBytes(6).toString('hex')}.tmp`;

  fs.writeFileSync(temp, body);
  fs.renameSync(temp, file);

  return { ok: true };
}

export function getSkill(libraryDir, hash) {
  const file = skillFile(libraryDir, hash);

  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

const keptSnapshotFile = (libraryDir, { skill, run, iteration }) =>
  path.join(libraryDir, 'skills', skill, 'snapshots', `${run}-${iteration}.json`);

function checkedSnapshotRefs(snapshots) {
  if (!Array.isArray(snapshots)) throw new Error('The snapshots to keep come as a list.');

  if (snapshots.length > MAX_KEPT_SNAPSHOTS) throw new Error('A skill keeps at most 12 snapshots.');

  if (!snapshots.every(isSnapshotRef)) throw new Error('Each snapshot names a training run and an iteration.');

  return snapshots;
}

function copied(from, to) {
  try {
    fs.copyFileSync(from, to);

    return true;
  } catch {
    return false;
  }
}

export function keepSnapshots(libraryDir, jobsDir, { hash, snapshots } = {}) {
  const skill = checkedHash(hash);
  const refs = checkedSnapshotRefs(snapshots).filter((ref) => fs.existsSync(snapshotFile(jobsDir, ref)));

  if (!refs.length) return [];

  fs.mkdirSync(path.join(libraryDir, 'skills', skill, 'snapshots'), { recursive: true });

  return refs.filter((ref) => copied(snapshotFile(jobsDir, ref), keptSnapshotFile(libraryDir, { skill, ...ref })));
}

export function getKeptSnapshot(libraryDir, { skill, run, iteration } = {}) {
  if (typeof skill !== 'string' || !HASH.test(skill) || !isSnapshotRef({ run, iteration })) return null;

  return readJsonOrNull(keptSnapshotFile(libraryDir, { skill, run, iteration }));
}
