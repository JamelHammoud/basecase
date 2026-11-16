const NAME = /^(?!.*(?:--|\.\.))[A-Za-z0-9](?:[A-Za-z0-9._-]{0,94}[A-Za-z0-9])?$/;
const REVISION = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,128}$/;

export const COMMIT = /^[a-f0-9]{40}$/;
export const SKILL_FILE_BYTES = 32 * 1024 * 1024;
export const SKILL_DOWNLOADS = Object.freeze([
  'skill.json',
  'policy.json',
  'contract.json',
  'environment.json',
  'evidence.json',
  'robot.json',
]);

export function checkedName(name) {
  const value = String(name ?? '');

  if (!NAME.test(value)) throw new Error(`“${value.slice(0, 100)}” can’t name a Hugging Face repo.`);

  return value;
}

export function checkedRevision(rev) {
  const value = String(rev ?? 'main');

  if (!REVISION.test(value)) throw new Error(`“${value.slice(0, 100)}” isn’t a branch of a Hugging Face repo.`);

  return value;
}

export async function readHubBytes(response, maxBytes, label) {
  const size = Number(response.headers.get('content-length'));

  if (size > maxBytes) {
    await response.body?.cancel();

    throw new Error(`${label} is too large.`);
  }

  const reader = response.body?.getReader();
  const chunks = [];
  let length = 0;

  if (!reader) return new Uint8Array();

  try {
    for (;;) {
      const { value, done } = await reader.read();

      if (done) break;

      length += value.byteLength;

      if (length > maxBytes) throw new Error(`${label} is too large.`);

      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

export async function digest(bytes, algorithm = 'SHA-256') {
  return Array.from(new Uint8Array(await crypto.subtle.digest(algorithm, bytes)), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
}

export async function matchesFile(file, bytes) {
  if (file?.lfs) return file.lfs.sha256 === (await digest(bytes));

  const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  const object = new Uint8Array(header.length + bytes.byteLength);

  object.set(header);
  object.set(bytes, header.length);

  return file?.blobId === (await digest(object, 'SHA-1'));
}

export async function skillFiles(client, { owner, repo, rev } = {}) {
  const id = `${checkedName(owner)}/${checkedName(repo)}`;
  const requested = checkedRevision(rev);
  const revision = COMMIT.test(requested) ? requested : await client.revisionSha(id, requested);

  if (!COMMIT.test(revision)) throw new Error('Hugging Face didn’t name a commit for that revision.');

  const files = {};

  for (const path of SKILL_DOWNLOADS) {
    files[path] = new TextDecoder().decode(
      await client.download(`/${id}/resolve/${revision}/${path}`, {
        maxBytes: SKILL_FILE_BYTES,
        label: path,
      }),
    );
  }

  return { repo: id, revision, files };
}
