import crypto from 'node:crypto';

const GIT_OBJECT_DIGEST = 'sha1';

export function gitBlob(bytes) {
  return crypto.hash(GIT_OBJECT_DIGEST, Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]), 'hex');
}
