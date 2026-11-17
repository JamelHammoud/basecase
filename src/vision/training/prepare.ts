import { checkEvidenceFrameCount } from './evidence';
import { freezeVersion, type Dataset } from '../../datasets/datasetFile';
import { resolveSnapshot, snapshotHash } from '../../datasets/datasetSnapshot';
import { restoreImages } from '../../datasets/snapshotImages';
import { saveDataset } from '../../datasets/datasetStore';
import { loadManifests } from '../../cases/tryStore';
import { captureInspectionSource, captureInspectionSources } from './inspectionSources';
import { preparationSources } from './prepareSources';
import { preparationWorker } from './prepareWorker';
import { preparationTransfer, type VisionTrainingKind } from './prepareData';

export interface PreparationPorts {
  resolve: typeof resolveSnapshot;
  restore: typeof restoreImages;
  hash: typeof snapshotHash;
  save: typeof saveDataset;
  manifests: typeof loadManifests;
  inspectionSource?: typeof captureInspectionSource;
}

const defaults: PreparationPorts = {
  resolve: resolveSnapshot,
  restore: restoreImages,
  hash: snapshotHash,
  save: saveDataset,
  manifests: loadManifests,
  inspectionSource: captureInspectionSource,
};

export interface PreparationOptions {
  ports?: PreparationPorts;
  at?: string;
}

export async function prepareVisionTraining(
  dataset: Dataset,
  kind: VisionTrainingKind,
  options: PreparationOptions = {},
) {
  const ports = options.ports ?? defaults;
  const selected =
    dataset.selectedVersion === undefined
      ? null
      : dataset.versions.find((version) => version.n === dataset.selectedVersion);

  if (dataset.selectedVersion !== undefined && !selected?.snapshot)
    throw new Error('Choose a dataset version with frozen images.');

  if (selected?.snapshot && (await ports.hash(selected.snapshot)) !== selected.hash)
    throw new Error('The frozen dataset version changed.');

  const images = { ...dataset, members: [], samples: [] };
  const snapshot = selected?.snapshot ?? (await ports.resolve({ dataset: images }));
  const sets = await ports.restore(snapshot.images);
  const provenance = await preparationSources(sets, ports.manifests);
  const prepared = await preparationWorker.call(
    'prepare',
    { snapshot, sets, provenance, kind, seed: dataset.seed, frozen: !!selected },
    preparationTransfer(sets),
  );

  checkEvidenceFrameCount(
    prepared.samples.filter((sample) => sample.split === 'test' && prepared.realSourceIds.includes(sample.source))
      .length,
  );
  prepared.provenance = await captureInspectionSources({
    sources: prepared.provenance,
    samples: prepared.samples,
    realSourceIds: prepared.realSourceIds,
    capture: ports.inspectionSource,
  });

  if (selected) return { ...prepared, dataset, version: selected };

  const frozen = freezeVersion(
    images,
    await ports.hash(prepared.snapshot),
    options.at ?? new Date().toISOString(),
    prepared.snapshot,
  );
  const saved = { ...dataset, versions: frozen.dataset.versions };

  await ports.save(saved);

  return { ...prepared, version: frozen.version, dataset: saved };
}

export type PreparedVisionTraining = Awaited<ReturnType<typeof prepareVisionTraining>>;
