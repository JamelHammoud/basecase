import { checkedFileId } from '../backend/constants.mjs';
import { checkedHash } from './files.mjs';

export const MAX_JOB_BYTES = 16 * 1024 * 1024;
export const MAX_RUN_BYTES = 8 * 1024 * 1024;
export const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;

function checkedSample(sample) {
  checkedHash(sample?.id);

  if (
    !plain(sample) ||
    sample.image !== `images/${sample.id}.jpg` ||
    !['train', 'validation', 'test'].includes(sample.split)
  ) {
    throw new Error('Check the training image path and split');
  }

  if (
    !uint(sample.width) ||
    !uint(sample.height) ||
    sample.width < 1 ||
    sample.height < 1 ||
    sample.width > 8192 ||
    sample.height > 8192 ||
    sample.width * sample.height > 16_777_216
  )
    throw new Error('Check the training image size');

  if (!Array.isArray(sample.annotations) || sample.annotations.length > 10_000)
    throw new Error('Check the training labels');
}

function checkedClass(value) {
  if (
    !plain(value) ||
    !uint(value.id) ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > 200
  )
    throw new Error('Check the training classes');

  if (
    value.keypoints !== undefined &&
    (!Array.isArray(value.keypoints) ||
      value.keypoints.length > 256 ||
      !value.keypoints.every((name) => typeof name === 'string' && name.length > 0 && name.length <= 200))
  )
    throw new Error('Check the training keypoints');
}

function checkedJobSettings(job) {
  if (
    !plain(job) ||
    job.version !== 1 ||
    !['detect', 'segment', 'keypoints', 'classify'].includes(job.kind) ||
    !uint(job.seed) ||
    job.epochs !== 10 ||
    job.batch !== 4 ||
    job.imageSize !== 128 ||
    job.device !== 'auto'
  )
    throw new Error('Check the training job');
}

function checkedJobLists(job) {
  if (!Array.isArray(job.classes) || !job.classes.length || job.classes.length > 1000)
    throw new Error('Check the training classes');

  job.classes.forEach(checkedClass);

  if (new Set(job.classes.map((value) => value.id)).size !== job.classes.length)
    throw new Error('Check the training classes');

  if (!Array.isArray(job.samples) || job.samples.length < 2 || job.samples.length > 10_000)
    throw new Error('Check the training samples');

  job.samples.forEach(checkedSample);

  if (new Set(job.samples.map((sample) => sample.id)).size !== job.samples.length)
    throw new Error('Training images must be distinct');

  const splits = new Set(job.samples.map((sample) => sample.split));

  if (!splits.has('train') || !splits.has('validation'))
    throw new Error('Training needs separate train and validation images');

  if (job.kind === 'classify' && job.classes.length < 2) throw new Error('Training needs two classification classes');

  if (job.kind === 'keypoints' && !job.classes.some((category) => category.keypoints?.length))
    throw new Error('Training needs named keypoints');
}

export function checkedStart(payload) {
  checkedFileId(payload?.id);

  const job = payload?.job;

  checkedJobSettings(job);

  checkedJobLists(job);

  const images = payload.images;

  if (!Array.isArray(images) || images.length !== job.samples.length) throw new Error('Training needs every image');

  images.forEach((image) => {
    checkedHash(image?.id);
    checkedHash(image?.content);

    if (image.packed !== undefined && typeof image.packed !== 'boolean')
      throw new Error('Check the frozen image format');

    if (image.packed && image.id !== image.content) throw new Error('The frozen image binding must match its hash');
  });

  const refs = new Map(
    images.map((image) => [image.id, { id: image.id, content: image.content, packed: image.packed === true }]),
  );

  if (refs.size !== images.length || !job.samples.every((sample) => refs.has(sample.id)))
    throw new Error('Training needs every image');

  const json = JSON.stringify(job);

  if (Buffer.byteLength(json) > MAX_JOB_BYTES - 32) throw new Error('The training job is too large');

  return { id: payload.id, job, refs, json, resume: payload.resume === true };
}

export function checkedRun(run) {
  checkedFileId(run?.id);
  checkedFileId(run?.datasetId);

  if (
    !plain(run) ||
    run.version !== 1 ||
    !Number.isInteger(run.datasetVersion) ||
    run.datasetVersion < 1 ||
    !['retained', 'checkpoint'].includes(run.status)
  )
    throw new Error('Check the training run');

  checkedFileId(run.jobId);

  const json = JSON.stringify(run);

  if (Buffer.byteLength(json) > MAX_RUN_BYTES) throw new Error('The training run is too large');

  return json;
}
