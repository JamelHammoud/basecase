import type { HubRepoRef } from '../../../hub/hubBridge';
import { AnonymousHubClient } from '../../../hub/anonymousHubClient';
import { SkillSearch } from '../../../hub/skillSearch.mjs';
import { digest, skillFiles } from '../../../hub/skillDownloads.mjs';
import { remoteRecords } from '../../../hub/remoteOutcomes.mjs';
import { reply } from '../../workerRpc';
import { idbAll, idbPutBounded } from './idb';

const client = new AnonymousHubClient();
const search = new SkillSearch();
const PREFIX = 'skill-outcome/';
const RECORDS_MAX = 100;
const LOCAL_MAX = 1000;
const RECORD_BYTES = 256 * 1024;

async function outcomeId(record: unknown) {
  const text = JSON.stringify(record);
  const bytes = text && new TextEncoder().encode(text);

  if (!bytes || bytes.byteLength > RECORD_BYTES) throw new Error('The installation outcome is too large.');

  return digest(bytes);
}

async function saveOutcome(record: unknown) {
  const id = await outcomeId(record);

  await idbPutBounded({
    store: 'settings',
    key: `${PREFIX}${id}`,
    value: { id, record },
    prefix: PREFIX,
    max: LOCAL_MAX,
  });

  return { stored: true, published: false };
}

async function outcomes() {
  const remote = remoteRecords(client);
  const local = await idbAll<{ id: string; record: unknown }>('settings', PREFIX, LOCAL_MAX);
  const found = new Map<string, unknown>();

  for (const saved of local.slice(0, LOCAL_MAX)) {
    if (found.size >= RECORDS_MAX) break;

    try {
      if (saved.id === (await outcomeId(saved.record))) found.set(saved.id, saved.record);
    } catch {
      continue;
    }
  }

  for (const record of await remote) {
    if (found.size >= RECORDS_MAX) break;

    found.set(await outcomeId(record), record);
  }

  return [...found.values()];
}

export const WEB_HUB_HANDLERS = {
  find: async () => reply(await search.find(client)),
  files: async (ref: HubRepoRef) => reply(await skillFiles(client, ref)),
  saveOutcome: async (record: unknown) => reply(await saveOutcome(record)),
  outcomes: async () => reply(await outcomes()),
};
