import type { Dataset, DatasetVersion } from '../datasets/datasetFile';
import { loadDatasetContent } from '../datasets/datasetStore/content';
import { exportDatasetArchiveFiles, exportDatasetFiles, exportDatasetZip } from '../datasets/datasetClient';
import { plural } from '../../electron/plural.mjs';
import { hubBridge } from '../hub/hubBridge';
import { downloadBytes } from '../utils/downloadBytes';
import { openLink } from '../utils/openLink';
import { imageDatasetZip } from '../vision/imageDataset';
import { datasetLeftOut, repoName, type PreparedDataset } from './datasetJob';
import { fileSafe } from './helpers';
import type { DatasetRecords } from './useDatasetRecords';
import type { ToastOptions } from './types';

export interface DatasetDelivery {
  version: DatasetVersion;
  prepared?: PreparedDataset;
}

export interface DatasetDeliveryResult {
  message: string;
  options?: ToastOptions;
}

export const datasetForVersion = (dataset: Dataset, version: DatasetVersion): Dataset => ({
  ...dataset,
  ...version.snapshot?.dataset,
  task: version.snapshot?.task ?? dataset.task,
  members: version.members,
  imageMembers: version.imageMembers,
});

async function savedArchive(version: DatasetVersion) {
  const bytes = await loadDatasetContent(version.archive!);

  if (!bytes) throw new Error('The dataset is missing its saved export.');

  return bytes;
}

export async function datasetDownload(
  dataset: Dataset,
  records: DatasetRecords,
  { version, prepared }: DatasetDelivery,
): Promise<Uint8Array> {
  if (version.archive) return savedArchive(version);

  const snapshot = version.snapshot;

  if (!snapshot) throw new Error('Freeze the dataset before exporting.');

  if (!snapshot.images.length && !prepared) throw new Error('The dataset has no samples to export.');

  const frozen = datasetForVersion(dataset, version);
  const bytes = snapshot.images.length
    ? await imageDatasetZip(frozen, prepared ? await exportDatasetFiles(prepared.job) : {}, snapshot.images)
    : await exportDatasetZip(prepared!.job);

  return records.archive(dataset, version, bytes);
}

function exportedMessage({ version, prepared }: DatasetDelivery) {
  const images = version.snapshot?.images.length ?? 0;
  const used = prepared?.used ?? version.snapshot?.samples.filter((sample) => !sample.excluded.length).length ?? 0;
  const left = prepared?.left ?? version.snapshot?.samples.filter((sample) => sample.excluded.length).length ?? 0;
  const counts = [...(images ? [plural(images, 'image')] : []), ...(used ? [plural(used, 'try', 'tries')] : [])];

  return `Exported ${counts.join(' and ')}${datasetLeftOut({ left })}`;
}

export async function deliverDataset(
  dataset: Dataset,
  records: DatasetRecords,
  publish: boolean,
  delivery: DatasetDelivery,
): Promise<DatasetDeliveryResult> {
  const bytes = await datasetDownload(dataset, records, delivery);
  const frozen = datasetForVersion(dataset, delivery.version);

  if (!publish) {
    downloadBytes(bytes, `${fileSafe(frozen.name)}-dataset.zip`, 'application/zip');

    return { message: exportedMessage(delivery) };
  }

  const published = await hubBridge.publish({
    name: await repoName(frozen.name, frozen.id),
    files: await exportDatasetArchiveFiles(bytes),
    tag: `dataset-v${delivery.version.n}`,
  });
  const left =
    delivery.prepared?.left ??
    delivery.version.snapshot?.samples.filter((sample) => sample.excluded.length).length ??
    0;

  return {
    message: `Published to ${published.repo}${datasetLeftOut({ left })}`,
    options: { action: { label: 'Open', onClick: () => openLink(published.url) } },
  };
}

export const imageDatasetDownload = datasetDownload;
export const deliverImageDataset = deliverDataset;
