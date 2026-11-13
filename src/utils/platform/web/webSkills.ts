import { isSkill } from '../../../skills/bundle';
import { isHash } from '../../../skills/hash';
import { idbGet, idbPut } from './idb';

const MAX_SKILL_CHARS = 32 * 1024 * 1024;

function checkedHash(hash: unknown): string {
  if (!isHash(hash)) throw new Error('A skill is named by its hash.');

  return hash;
}

function checkedSkill(text: unknown): string {
  if (typeof text !== 'string' || text.length > MAX_SKILL_CHARS) throw new Error('The skill is too large.');

  if (!isSkill(JSON.parse(text))) throw new Error('Not a Basecase skill.');

  return text;
}

export async function saveSkill(body: { hash?: unknown; text?: unknown }) {
  const hash = checkedHash(body.hash);

  await idbPut('skills', hash, checkedSkill(body.text));

  return { ok: true };
}

export async function getSkill(hash: unknown): Promise<unknown> {
  const text = await idbGet<string>('skills', checkedHash(hash));

  return typeof text === 'string' ? JSON.parse(text) : null;
}
