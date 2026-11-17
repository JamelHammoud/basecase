import { claim } from './claim.mjs';
import { createPull, editPull, setReview } from './github.mjs';
import { completeDelivery, deliveryFor, saveDelivery } from './deliveryState.mjs';
import { recordPublication } from './publicationJournal.mjs';
import { clearAttemptedHead } from './pullState.mjs';
import { fingerprint } from './sessionJournal.mjs';
import { json, run } from './sh.mjs';

const defaults = () => ({ execute: run, readJson: json, create: createPull, edit: editPull, review: setReview });

function existingPull(entry, readJson) {
  const args = entry.number
    ? ['pr', 'view', String(entry.number), '--json', 'url,state,headRefOid']
    : ['pr', 'list', '--state', 'all', '--head', entry.branch, '--limit', '1', '--json', 'url,state,headRefOid'];
  const found = readJson('gh', args, { cwd: entry.dir });

  return entry.number ? found : found?.[0];
}

function sendMetadata(entry, existing, services) {
  if (!entry.number || existing?.headRefOid !== entry.sha)
    throw new Error('Pull request head changed since metadata verification');

  services.review(entry.sha, 'error', 'Pull request details revised. Review them again');
  services.edit(entry.number, { title: entry.title, body: entry.body });
  clearAttemptedHead(entry.number, entry.sha);

  return existing.url;
}

function send(entry, existing, services) {
  if (entry.metadataOnly) return sendMetadata(entry, existing, services);

  const head = services.execute('git', ['rev-parse', 'HEAD'], { cwd: entry.dir }).out.trim();

  if (head !== entry.sha) throw new Error('Pending delivery changed since verification');

  services.execute('git', ['push', '-q', '-u', 'origin', entry.branch], { cwd: entry.dir });

  if (!entry.number) return services.create(entry);

  services.edit(entry.number, { title: entry.title, body: entry.body });

  return existing?.url;
}

const staleMetadata = (entry, existing) =>
  entry.metadataOnly && existing?.headRefOid && existing.headRefOid !== entry.sha;

export function deliver(saved, dependencies = {}) {
  const services = { ...defaults(), ...dependencies };
  const release = claim(`delivery-${fingerprint(saved.branch)}`);

  if (!release) return null;

  let entry;

  try {
    entry = deliveryFor(saved.branch);

    if (!entry) return null;

    const existing = existingPull(entry, services.readJson);

    if (existing?.url && (!entry.number || existing.state !== 'OPEN')) {
      recordPublication(entry, existing.url, existing.headRefOid ?? null);
      completeDelivery(entry.branch);

      return existing.url;
    }

    if (staleMetadata(entry, existing)) {
      completeDelivery(entry.branch);

      return null;
    }

    const url = send(entry, existing, services);

    if (!url) throw new Error('Pull request delivery returned no URL');

    recordPublication(entry, url);
    completeDelivery(entry.branch);

    return url;
  } catch (error) {
    if (!entry) throw error;

    saveDelivery({
      ...entry,
      attempts: (entry.attempts ?? 0) + 1,
      error: error.message.slice(0, 1000),
      attemptedAt: Date.now(),
    });

    throw error;
  } finally {
    release();
  }
}
