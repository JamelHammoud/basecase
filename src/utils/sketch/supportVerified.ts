import type { PartSketch } from './types';

const verified = new WeakMap<PartSketch, string>();

export const isSupportVerified = (record: PartSketch, fingerprint: string) => verified.get(record) === fingerprint;

export function rememberSupport(record: PartSketch | undefined) {
  if (record?.support && !record.support.issue) verified.set(record, record.support.fingerprint);
}
