import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from './bundle.mjs';
import { ARTIFACT_BYTES, remoteDirectory } from './scripts.mjs';

export function snapshotIterations(events) {
  const iterations = events
    .filter((event) => event.type === 'snapshot' && Number.isSafeInteger(event.iteration) && event.iteration >= 0)
    .map((event) => event.iteration);

  return [...new Set(iterations)].slice(-12);
}

function script(descriptor, iteration) {
  return `set -eu
cd ${remoteDirectory(descriptor.id)}
file='snapshots/${iteration}.json'
if ! test -f "$file"; then printf '{}'; exit 0; fi
bytes=$(wc -c < "$file")
test "$bytes" -le ${ARTIFACT_BYTES}
hash=$(sha256sum "$file")
hash=$(printf '%s' "$hash" | cut -c 1-64)
printf '{"hash":"%s","data":"' "$hash"
base64 -w 0 "$file"
printf '"}'
`;
}

function checkedBytes(reply) {
  if (typeof reply.data !== 'string' || reply.data.length > Math.ceil(ARTIFACT_BYTES / 3) * 4)
    throw new Error('The remote training snapshot exceeds 64 MB.');

  const bytes = Buffer.from(reply.data, 'base64');

  if (bytes.toString('base64') !== reply.data || sha256(bytes) !== reply.hash)
    throw new Error('The remote training snapshot failed verification.');

  JSON.parse(bytes.toString('utf8'));

  return bytes;
}

export async function downloadSnapshots({ descriptor, events, execute, computer }) {
  const dir = path.join(descriptor.dir, 'snapshots');
  let total = 0;

  for (const iteration of snapshotIterations(events)) {
    const file = path.join(dir, `${iteration}.json`);

    if (fs.existsSync(file)) continue;

    const text = await execute(computer, script(descriptor, iteration), 90 * 1024 * 1024);
    const reply = JSON.parse(text);

    if (!reply.data) continue;

    const bytes = checkedBytes(reply);

    total += bytes.length;

    if (total > 128 * 1024 * 1024) throw new Error('The remote training snapshots exceed 128 MB.');

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${file}.partial`, bytes, { mode: 0o600 });
    fs.renameSync(`${file}.partial`, file);
  }
}
