import { claim } from './claim.mjs';
import { createPull, editPull } from './github.mjs';
import { completeDelivery, saveDelivery } from './deliveryState.mjs';
import { fingerprint } from './sessionJournal.mjs';
import { json, run } from './sh.mjs';

const defaults = () => ({ execute: run, readJson: json, create: createPull, edit: editPull });

function existingPull(entry, readJson) {
  const args = entry.number
    ? ['pr', 'view', String(entry.number), '--json', 'url,state']
    : ['pr', 'list', '--state', 'all', '--head', entry.branch, '--limit', '1', '--json', 'url,state'];
  const found = readJson('gh', args, { cwd: entry.dir });

  return entry.number ? found : found?.[0];
}

function send(entry, existing, services) {
  const head = services.execute('git', ['rev-parse', 'HEAD'], { cwd: entry.dir }).out.trim();

  if (head !== entry.sha) throw new Error('Pending delivery changed since verification');

  services.execute('git', ['push', '-q', '-u', 'origin', entry.branch], { cwd: entry.dir });

  if (!entry.number) return services.create(entry);

  services.edit(entry.number, { title: entry.title, body: entry.body });

  return existing?.url;
}

export function deliver(entry, dependencies = {}) {
  const services = { ...defaults(), ...dependencies };
  const release = claim(`delivery-${fingerprint(entry.branch)}`);

  if (!release) return null;

  try {
    const existing = existingPull(entry, services.readJson);

    if (existing?.url && (!entry.number || existing.state !== 'OPEN')) {
      completeDelivery(entry.branch);

      return existing.url;
    }

    const url = send(entry, existing, services);

    if (!url) throw new Error('Pull request delivery returned no URL');

    completeDelivery(entry.branch);

    return url;
  } catch (error) {
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
