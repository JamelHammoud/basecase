const MAX_VERSIONS = 100_000;
const SAFE_ID = /^[\w-]{1,128}$/;
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value, max) => typeof value === 'string' && value.length <= max;
const isIds = (value) => Array.isArray(value) && value.length <= MAX_VERSIONS && value.every((id) => typeof id === 'string' && SAFE_ID.test(id));
const isHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function checkedVersion(version) {
  if (!isObject(version) || !Number.isSafeInteger(version.n) || version.n < 1 || !isText(version.hash, 128) ||
      !isText(version.at, 64) || !isIds(version.members) ||
      (version.snapshot !== undefined && !isObject(version.snapshot)) ||
      (version.archive !== undefined && !isHash(version.archive))) {
    throw new Error('The dataset has a damaged saved version.');
  }

  return version;
}

function checkedVersions(dataset) {
  const versions = dataset?.versions ?? [];

  if (!Array.isArray(versions) || versions.length > MAX_VERSIONS || dataset?.versions === null) {
    throw new Error('The dataset has a damaged version history.');
  }

  const checked = versions.map(checkedVersion);

  if (new Set(checked.map((version) => version.n)).size !== checked.length) {
    throw new Error('The dataset repeats a saved version number.');
  }

  return checked;
}

const ordered = (_key, value) => isObject(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value;
const metadataOf = (version) => {
  const metadata = { ...version };

  delete metadata.archive;

  return JSON.stringify(metadata, ordered);
};

function mergeVersion(previous, next) {
  if (!previous) return next;

  if (metadataOf(previous) !== metadataOf(next) || (previous.archive && next.archive && previous.archive !== next.archive)) {
    throw new Error('The dataset’s saved version can’t be changed.');
  }

  return previous.archive || !next.archive ? previous : { ...previous, archive: next.archive };
}

export function mergeDatasetVersions(dataset, current) {
  const versions = new Map(checkedVersions(current).map((version) => [version.n, version]));

  for (const version of checkedVersions(dataset)) versions.set(version.n, mergeVersion(versions.get(version.n), version));

  if (versions.size > MAX_VERSIONS) throw new Error('The dataset has too many saved versions.');

  const merged = { ...dataset, versions: [...versions.values()].sort((a, b) => a.n - b.n) };

  delete merged.selectedVersion;

  return merged;
}
