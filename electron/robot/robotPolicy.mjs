import fs from 'node:fs';
import { getSkill } from '../backend/skillStore.mjs';
import { policyOnnx } from './policyOnnx.mjs';

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

const hasOnly = (value, keys) => Object.keys(value).sort().join() === keys.join();

function checkedRef(ask) {
  if (ask.kind === 'policy' && hasOnly(ask, ['id', 'kind']) && typeof ask.id === 'string')
    return { kind: 'policy', id: ask.id };

  if (ask.kind === 'skill' && hasOnly(ask, ['hash', 'kind']) && typeof ask.hash === 'string')
    return { kind: 'skill', hash: ask.hash };

  return undefined;
}

export const MAX_POLICY_CANDIDATES = 16;

export function checkedPolicyRefs(ask) {
  if (!Array.isArray(ask) || ask.length > MAX_POLICY_CANDIDATES) return undefined;

  const refs = ask.map((ref) => (isPlainObject(ref) ? checkedRef(ref) : undefined));

  return refs.every(Boolean) ? refs : undefined;
}

function storedSkill(libraryDir, hash) {
  try {
    return getSkill(libraryDir, hash);
  } catch {
    return null;
  }
}

export const robotPolicyBytes =
  ({ libraryDir, trainer }) =>
  (ref) => {
    if (ref.kind === 'policy') {
      const file = trainer.policyOnnx(ref.id);

      return file ? fs.readFileSync(file) : null;
    }

    const controller = storedSkill(libraryDir, ref.hash)?.controller;

    return controller?.kind === 'policy' ? policyOnnx(controller.policy) : null;
  };
