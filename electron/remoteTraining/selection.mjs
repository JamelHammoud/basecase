import fs from 'node:fs';
import path from 'node:path';
import { readJsonOrNull, RUN_ID } from '../backend/trainingSnapshots.mjs';

const sameHashes = (a, b) =>
  a &&
  b &&
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(([key, hash]) => b[key] === hash);

function checkedSelection(entry, value) {
  const attempts = entry.children.map((child) => {
    const attempt = value.attempts.find((item) => item.id === child.id);

    if (
      !attempt ||
      attempt.seed !== child.seed ||
      attempt.steps !== (child.steps ?? 0) ||
      !sameHashes(attempt.fingerprint, child.descriptor.inputHashes)
    )
      throw new Error('The seed selection does not match this training workflow.');

    const development = attempt.development;

    if (development !== null && (!Number.isFinite(development?.score) || development.kind !== value.evaluation))
      throw new Error('The seed selection does not match this training workflow.');

    return {
      id: child.id,
      seed: child.seed,
      fingerprint: child.descriptor.inputHashes,
      steps: child.steps ?? 0,
      development,
      ...(child.outcome.kind === 'error' ? { error: child.outcome.message } : {}),
    };
  });

  return { evaluation: value.evaluation, selected: value.selected, attempts };
}

export function recordSeedSelection(jobsDir, value) {
  if (
    !value ||
    !Array.isArray(value.attempts) ||
    value.attempts.length < 2 ||
    value.attempts.length > 4 ||
    !['nominal-contract-v1', 'cloning-validation-loss-v1'].includes(value.evaluation)
  )
    throw new Error('The seed selection does not match this training workflow.');

  const ids = fs.readdirSync(jobsDir).filter((id) => RUN_ID.test(id));
  const saved = ids.map((id) => ({
    file: path.join(jobsDir, id, 'remote-request.json'),
    entry: readJsonOrNull(path.join(jobsDir, id, 'remote-request.json')),
  }));
  const match = saved.find(({ entry }) =>
    entry?.children?.some((child) => child.id === value.selected && child.outcome?.kind === 'done'),
  );

  if (!match || match.entry.children.length !== value.attempts.length)
    throw new Error('The seed selection does not match this training workflow.');

  const selection = checkedSelection(match.entry, value);

  if (match.entry.selection && JSON.stringify(match.entry.selection) !== JSON.stringify(selection))
    throw new Error('The recovered seed selection changed. Start training again.');

  fs.writeFileSync(`${match.file}.tmp`, JSON.stringify({ ...match.entry, selection }));
  fs.renameSync(`${match.file}.tmp`, match.file);

  return true;
}
