import { IS_WEB_DEMO } from '../../utils/platform/webDemo';
import {
  checkedDatasetContentHash,
  checkedDatasetContentBytes,
  datasetContentHash,
  verifiedDatasetContent,
} from '../contentHash';
import { desktopDatasets } from './desktopDatasets';
import { webDatasets } from './webDatasets';

const backend = IS_WEB_DEMO ? webDatasets : desktopDatasets;

export async function saveDatasetContent(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(checkedDatasetContentBytes(bytes));
  const hash = await datasetContentHash(copy);
  const saved = await backend.saveContent(copy);

  if (saved !== hash) throw new Error('Dataset content doesn’t match its hash');

  return hash;
}

export async function loadDatasetContent(hash: string): Promise<Uint8Array | null> {
  checkedDatasetContentHash(hash);

  const bytes = await backend.content(hash);

  return bytes === null ? null : verifiedDatasetContent(bytes, hash);
}
