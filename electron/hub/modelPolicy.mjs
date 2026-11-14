export const MODEL_ASSET_PREFIX = '/api/vision-model/';

export const MODEL_FILE_BYTES = 256 * 1024 * 1024;

const NAME = /^(?!.*(?:--|\.\.))[A-Za-z0-9](?:[A-Za-z0-9._-]{0,94}[A-Za-z0-9])?$/;
const SEGMENT = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,128}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;

const matches = (value, pattern) => typeof value === 'string' && pattern.exec(value)?.[0] === value;

export function checkedModelRef(value) {
  const { owner, repo, revision, path, sha256, maxBytes } = value ?? {};

  if (!matches(owner, NAME) || !matches(repo, NAME))
    throw new Error('The vision model needs a Hugging Face owner and repo.');

  if (!matches(revision, COMMIT)) throw new Error('The vision model needs a pinned Hugging Face commit.');

  if (typeof path !== 'string' || path.length > 300 || !path.split('/').every((segment) => matches(segment, SEGMENT)))
    throw new Error('The vision model path must stay inside its repo.');

  if (!matches(sha256, SHA256)) throw new Error('The vision model needs a SHA-256 checksum.');

  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MODEL_FILE_BYTES)
    throw new Error('The vision model size must be at most 256 MB.');

  return { owner, repo, revision, path, sha256, maxBytes };
}

export function modelResolvePath(value) {
  const ref = checkedModelRef(value);
  const file = ref.path.split('/').map(encodeURIComponent).join('/');

  return `/${ref.owner}/${ref.repo}/resolve/${ref.revision}/${file}`;
}

export function modelAssetPath(sha256) {
  if (!matches(sha256, SHA256)) throw new Error('The vision model needs a SHA-256 checksum.');

  return `${MODEL_ASSET_PREFIX}${sha256}`;
}
