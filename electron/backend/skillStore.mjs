import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const HASH = /^[0-9a-f]{64}$/;
const MAX_SKILL_BYTES = 32 * 1024 * 1024;
const SKILL_FORMAT = 'basecase-skill';

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
