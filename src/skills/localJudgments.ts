import { sha256Hex } from './hash';

export type LocalJudgment = () => Uint8Array;

export function localJudgments(salt?: string): LocalJudgment | undefined {
  if (salt === undefined) return undefined;

  if (!/^[0-9a-f]{64}$/.test(salt)) throw new Error('The local judgment key has the wrong format.');

  let sequence = 0;

  return () => {
    const digest = sha256Hex(`local-judgment|${salt}|${sequence++}`);

    return Uint8Array.from(digest.match(/../g)!, (byte) => Number.parseInt(byte, 16));
  };
}

export const judgmentHex = (judgment?: LocalJudgment) =>
  judgment?.().reduce((text, byte) => text + byte.toString(16).padStart(2, '0'), '');
