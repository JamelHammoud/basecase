import type { Dataset } from '../datasets/datasetFile';
import { imageCount } from '../datasets/datasetView';
import { exportDatasetFiles } from '../datasets/datasetClient';
import { plural } from '../../electron/plural.mjs';
import { hubBridge } from '../hub/hubBridge';
import { downloadBytes } from '../utils/downloadBytes';
import { openLink } from '../utils/openLink';
import { imageDatasetFiles, imageDatasetZip } from '../vision/imageDataset';
import { datasetLeftOut, repoName, type PreparedDataset } from './datasetJob';
import { fileSafe } from './helpers';
import type { DatasetRecords } from './useDatasetRecords';
import type { ToastOptions } from './types';

interface DeliveryResult {
  message: string;
  options?: ToastOptions;
}

export async function imageDatasetDownload(
  dataset: Dataset,
  records: DatasetRecords,
  prepared?: PreparedDataset,
): Promise<Uint8Array> {
  const zip = await imageDatasetZip(dataset, prepared ? await exportDatasetFiles(prepared.job) : {});

  await records.freeze(dataset, prepared?.modelHash ?? '');

  return zip;
}

export async function deliverImageDataset(
  dataset: Dataset,
  records: DatasetRecords,
  publish: boolean,
  prepared?: PreparedDataset,
): Promise<DeliveryResult> {
  if (!publish) {
    const zip = await imageDatasetDownload(dataset, records, prepared);
    const images = imageCount(dataset);

    downloadBytes(zip, `${fileSafe(dataset.name)}-dataset.zip`, 'application/zip');

    return {
      message: prepared
        ? `Exported ${plural(images, 'image')} and ${plural(prepared.used, 'try', 'tries')}${datasetLeftOut(prepared)}`
        : `Exported ${plural(images, 'image')}`,
    };
  }

  const files = await imageDatasetFiles(dataset, undefined, prepared ? await exportDatasetFiles(prepared.job) : {});
  const version = await records.freeze(dataset, prepared?.modelHash ?? '');
  const published = await hubBridge.publish({
    name: await repoName(dataset.name, dataset.id),
    files,
    tag: `dataset-v${version.n}`,
  });

  return {
    message: `Published to ${published.repo}${prepared ? datasetLeftOut(prepared) : ''}`,
    options: { action: { label: 'Open', onClick: () => openLink(published.url) } },
  };
}
