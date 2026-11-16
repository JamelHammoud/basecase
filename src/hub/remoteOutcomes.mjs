import { checkedName, COMMIT, matchesFile, readHubBytes } from './skillDownloads.mjs';

const RECORD_BYTES = 256 * 1024;
const SEARCH_BYTES = 2 * 1024 * 1024;
const RECORDS_MAX = 100;
const boundedJson = async (response) =>
  JSON.parse(new TextDecoder().decode(await readHubBytes(response, SEARCH_BYTES, 'Hub outcomes')));

function repoId(value) {
  const pieces = typeof value === 'string' ? value.split('/') : [];

  if (pieces.length !== 2) throw new Error('An outcome repo needs an account and a name.');

  return pieces.map(checkedName).join('/');
}

async function remoteRecord(client, raw) {
  try {
    const id = repoId(raw?.id);
    const info = await boundedJson(await client.api(`/api/models/${id}/revision/main?blobs=true`));
    const file = info.siblings?.find((entry) => entry.rfilename === 'outcome.json');

    if (!COMMIT.test(info.sha) || !Number.isSafeInteger(file?.size) || file.size <= 0 || file.size > RECORD_BYTES)
      return null;

    const bytes = await client.download(`/${id}/resolve/${info.sha}/outcome.json`, {
      maxBytes: RECORD_BYTES,
      label: 'Installation outcome',
    });
    const matches = await matchesFile(file, bytes);

    if (!matches) return null;

    const record = JSON.parse(new TextDecoder().decode(bytes));

    if (new TextEncoder().encode(JSON.stringify(record)).byteLength > RECORD_BYTES) return null;

    return record;
  } catch {
    return null;
  }
}

export async function remoteRecords(client) {
  try {
    const list = await boundedJson(
      await client.api(`/api/models?filter=basecase-skill-outcome&limit=${RECORDS_MAX}&full=true`),
    );

    if (!Array.isArray(list)) return [];

    const found = [];

    for (let at = 0; at < Math.min(list.length, RECORDS_MAX); at += 4) {
      found.push(
        ...(
          await Promise.all(list.slice(at, Math.min(at + 4, RECORDS_MAX)).map((raw) => remoteRecord(client, raw)))
        ).filter(Boolean),
      );
    }

    return found;
  } catch {
    return [];
  }
}
