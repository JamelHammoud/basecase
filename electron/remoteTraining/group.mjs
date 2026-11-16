import { seedJobs, seedSettings } from './seeds.mjs';

export function prepareSeedGroup(trainer, request) {
  const settings = seedSettings(trainer.remote.status?.() ?? {});

  if (settings.attempts === 1) return null;

  const jobs = seedJobs(request.job, settings);
  const entry = trainer.prepare(request, true);
  const children = jobs.map((job, index) => ({
    ...trainer.prepare({ ...request, job }, true),
    seed: job.seed,
    slot: index % settings.concurrency,
    grouped: true,
    dispatched: false,
  }));

  return { ...entry, children, concurrency: settings.concurrency };
}

export async function prepareSeedInputs(trainer, entry) {
  const saved = trainer.remote.descriptors();
  const frozen =
    entry.children.find((child) => child.descriptor)?.descriptor ??
    saved.find((descriptor) => entry.children.some((child) => child.id === descriptor.id));

  await Promise.all(
    entry.children.map(async (child) => {
      child.fingerprint = entry.fingerprint;
      child.descriptor ??= saved.find((descriptor) => descriptor.id === child.id);
      child.descriptor ??= await trainer.remote.prepare({ ...child, frozen });
    }),
  );
  trainer.persistRemote(entry);
}

function progress(trainer, entry) {
  const completed = entry.children.filter((child) => child.outcome).length;
  const elapsedS = entry.children.reduce((sum, child) => sum + (child.outcome ? 1 : (child.share ?? 0)), 0);

  trainer.sender(entry)({
    kind: 'progress',
    progress: { elapsedS, budgetS: entry.children.length },
    message: `Training attempts: ${completed}/${entry.children.length}`,
  });
}

function childOutcome(trainer, child, result) {
  const done = result.state === 'done' && result.events.findLast((event) => event.type === 'done');
  const steps = done && Number.isSafeInteger(done.steps) && done.steps >= 0 ? done.steps : 0;

  child.steps = Math.max(child.steps ?? 0, steps);
  child.development =
    child.job.algo === 'bc' && Number.isFinite(done?.bc?.heldOutLoss)
      ? { kind: 'cloning-loss', score: -done.bc.heldOutLoss }
      : null;

  return trainer.outcome(child, {
    code: result.code,
    done: done && { steps, stopped: done.stopped === true },
    err: result.stderr,
  });
}

async function pollChild(trainer, entry, child) {
  try {
    if (entry.stopping) {
      child.stopping = true;
      await trainer.remote.stop(child.descriptor);
    }

    if (!child.dispatched) {
      child.dispatching = true;
      trainer.persistRemote(entry);
      await trainer.remote.dispatch(child.descriptor);
      child.dispatched = true;
      trainer.persistRemote(entry);
    }

    const result = await trainer.remote.poll(child.descriptor);
    const latest = result.events.findLast((event) => event.type === 'progress');

    if (Number.isSafeInteger(latest?.steps) && latest.steps >= 0) child.steps = latest.steps;

    if (Number.isFinite(latest?.elapsedS) && latest.budgetS > 0)
      child.share = Math.min(1, Math.max(0, latest.elapsedS / latest.budgetS));

    if (result.state === 'running') return;

    child.outcome = childOutcome(trainer, child, result);
    trainer.remote.markCompleted(child.descriptor);
  } catch (error) {
    if (error.reconnect) {
      trainer.sender(entry)({ kind: 'status', message: 'Waiting for the training computer' });

      return;
    }

    child.outcome = { kind: 'error', message: error.message };
  } finally {
    trainer.persistRemote(entry);
  }
}

function completedGroup(entry) {
  const candidates = entry.children.map((child) => ({
    id: child.id,
    seed: child.seed,
    fingerprint: child.descriptor?.inputHashes ?? {},
    steps: child.steps ?? 0,
    development: child.development,
    outcome: child.outcome,
  }));
  const records = candidates.filter((child) => child.outcome.kind === 'done');

  if (entry.stopping) return { kind: 'error', message: 'Training stopped.' };

  if (!records.length) return { kind: 'error', message: 'Every training attempt failed.', candidates };

  return { kind: 'done', candidates, record: records[0].outcome.record };
}

export async function connectSeedGroup(trainer, running) {
  const { entry } = running;

  await (trainer.preparations.get(entry.id) ?? prepareSeedInputs(trainer, entry));
  trainer.preparations.delete(entry.id);

  if (trainer.disposed) return;

  for (const child of entry.children) {
    if (!entry.stopping || child.dispatching || child.outcome) continue;

    child.outcome = { kind: 'error', message: 'Training stopped.' };
  }

  const active = entry.children.filter((child) => !child.outcome);

  for (let at = 0; at < active.length; at += entry.concurrency)
    await Promise.all(active.slice(at, at + entry.concurrency).map((child) => pollChild(trainer, entry, child)));

  if (trainer.disposed) return;

  progress(trainer, entry);

  if (entry.children.every((child) => child.outcome)) trainer.complete(running, completedGroup(entry));
}
