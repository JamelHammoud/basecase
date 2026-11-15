import type { V3 } from '../utils/kinematics';
import { asRecord, asString, refuse, vector, type Reader } from './validate';

export interface ImportedWorldRef {
  hash: string;
  position: V3;
}

export const readWorldHash: Reader<string> = (value, where) => {
  const hash = asString(value, where);

  return /^[a-f0-9]{64}$/.test(hash) ? hash : refuse(where, 'must be a content hash');
};

export const readWorldReference: Reader<ImportedWorldRef> = (value, where) => {
  const v = asRecord(value, where);
  const position = vector(3)(v.position, `${where}.position`) as V3;

  if (position.some((n) => Math.abs(n) > 500_000)) return refuse(`${where}.position`, 'must be within 500000');

  return { hash: readWorldHash(v.hash, `${where}.hash`), position };
};
