import { checkedBuild, sameBuildOwner } from './buildAllocations.mjs';

const MAX_PRINTS = 200;
const text = (value) => typeof value === 'string' && value.length > 0 && value.length <= 100000;
const timestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function checkedRecord(record) {
  if (
    !text(record?.id) ||
    record.id.length > 200 ||
    !text(record.hash) ||
    !text(record.material) ||
    !timestamp(record.sentAt) ||
    !Array.isArray(record.parts) ||
    !record.parts.length ||
    record.parts.length > 10000 ||
    !record.parts.every((part) => text(part.id) && text(part.key)) ||
    new Set(record.parts.map((part) => part.id)).size !== record.parts.length ||
    !['sent', 'printing', 'printed', 'failed', 'cancelled', 'reprint'].includes(record.state)
  )
    throw new Error('The print record can’t establish its source.');

  checkedScene(record);

  if (!record.copies) return;

  checkedCopies(record);
}

function checkedScene(record) {
  if (record.sceneId !== undefined && (!text(record.sceneId) || record.sceneId.length > 200))
    throw new Error('The print record can’t establish its source.');

  if (record.origin !== undefined && !['entered', 'sent'].includes(record.origin))
    throw new Error('The print record can’t establish its source.');
}

function checkedCopies(record) {
  const parts = new Map(record.parts.map((part) => [part.id, part.key]));

  if (
    !Array.isArray(record.copies) ||
    !record.copies.length ||
    record.copies.length > 10000 ||
    !record.copies.every(
      (copy) =>
        text(copy.id) &&
        parts.has(copy.partId) &&
        text(copy.key) &&
        copy.id.length <= 200 &&
        (record.sourceKeys?.[copy.partId] ?? parts.get(copy.partId)) === copy.key &&
        Number.isInteger(copy.index) &&
        copy.index >= 0 &&
        copy.index < 50,
    ) ||
    new Set(record.copies.map((copy) => copy.id)).size !== record.copies.length ||
    new Set(record.copies.map((copy) => JSON.stringify([copy.partId, copy.index]))).size !== record.copies.length ||
    record.parts.some((part) => !record.copies.some((copy) => copy.partId === part.id))
  )
    throw new Error('Reconcile the printed quantities before assigning copies.');
}

function changedRevision(saved, incoming) {
  return (
    ['hash', 'material', 'sentAt'].some((field) => saved[field] !== incoming[field]) ||
    !!(saved.revision && saved.revision !== incoming.revision)
  );
}

function checkedPrintChange(saved, incoming) {
  if (
    saved &&
    (!same(saved.parts, incoming.parts) ||
      changedRevision(saved, incoming) ||
      (saved.sourceKeys && !same(saved.sourceKeys, incoming.sourceKeys)) ||
      (saved.copies && !same(saved.copies, incoming.copies)))
  )
    throw new Error('The retained print source has changed.');

  if (saved && !saved.copies && incoming.copies && !timestamp(incoming.reconciledAt))
    throw new Error('Reconcile the printed quantities before assigning copies.');
}

function printCycle(purchases, incoming) {
  return Object.values(purchases)
    .map((entry) => entry.printOutput?.record)
    .filter(
      (record) =>
        record?.sceneId === incoming.sceneId &&
        record.state === 'reprint' &&
        record.parts.some((part) => incoming.parts.some((source) => source.id === part.id)),
    )
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt) || b.id.localeCompare(a.id))[0]?.id;
}

function enteredAttempt(purchases, incoming) {
  if (!incoming.sceneId || (incoming.origin !== 'entered' && !incoming.completion?.enteredAt)) return undefined;

  const cycle = printCycle(purchases, incoming);

  return Object.values(purchases)
    .map((entry) => entry.printOutput?.record)
    .filter(
      (record) =>
        record?.copies &&
        record.sceneId === incoming.sceneId &&
        record.cycle === cycle &&
        ['hash', 'plate', 'material', 'revision'].every((field) => record[field] === incoming[field]) &&
        record.parts.every((part) => record.sourceKeys?.[part.id] === incoming.sourceKeys?.[part.id]) &&
        same(record.parts, incoming.parts),
    )
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt) || b.id.localeCompare(a.id))[0];
}

export function retainedPrintRecord(purchases, incoming) {
  const record = purchases[`print:${incoming.id}`]?.printOutput?.record ?? enteredAttempt(purchases, incoming);

  if (!record) throw new Error('The print record can’t establish its source.');

  return record;
}

function checkedCopyIdentities(purchases, key, incoming) {
  const otherCopies = new Set(
    Object.entries(purchases)
      .filter(([entryKey]) => entryKey !== key)
      .flatMap(([, entry]) => entry.printOutput?.record.copies?.map((copy) => copy.id) ?? []),
  );

  if (incoming.copies?.some((copy) => otherCopies.has(copy.id)))
    throw new Error('The retained print source has changed.');
}

function retainedEvidence(purchases, incoming, saved) {
  const cycle = saved?.cycle ?? (incoming.sceneId ? printCycle(purchases, incoming) : undefined);
  const record = { ...incoming, cycle, completion: { ...incoming.completion, ...saved?.completion } };

  if ((saved?.completion?.enteredAt || saved?.completion?.reportedAt) && ['sent', 'printing'].includes(incoming.state))
    record.state = saved.state;

  return record;
}

function savePrint(purchases, request) {
  checkedRecord(request);

  const recovered = !purchases[`print:${request.id}`]?.printOutput && enteredAttempt(purchases, request);
  const incoming = recovered ? { ...recovered, state: request.state, completion: request.completion } : request;
  const key = `print:${incoming.id}`;
  const previous = purchases[key]?.printOutput;
  const saved = previous?.record;

  if (!previous && Object.values(purchases).filter((entry) => entry.printOutput).length >= MAX_PRINTS)
    throw new Error('Print allocation history is full.');

  checkedPrintChange(saved, incoming);

  checkedCopyIdentities(purchases, key, incoming);

  const record = retainedEvidence(purchases, incoming, saved);

  return { ...purchases, [key]: { printOutput: { record, assignments: previous?.assignments ?? {} } } };
}

const matches = (record, copy, demand) =>
  copy.partId === demand.partId &&
  copy.key === demand.key &&
  record.material === demand.material &&
  (demand.labels === undefined ||
    (record.revision ?? JSON.stringify([record.hash, ''])) === JSON.stringify([record.hash, demand.labels]));

function pendingReprint(purchases, record, copy) {
  return Object.values(purchases).some((entry) => {
    const pending = entry.printOutput?.record;

    return (
      pending?.state === 'reprint' &&
      pending.material === record.material &&
      Date.parse(pending.sentAt) >= Date.parse(record.sentAt) &&
      pending.parts.some((part) => part.id === copy.partId && (pending.sourceKeys?.[part.id] ?? part.key) === copy.key)
    );
  });
}

export function availablePrintCopies(purchases, demand) {
  return Object.entries(purchases).flatMap(([key, entry]) => {
    const output = entry.printOutput;

    if (!output || output.record.state !== 'printed') return [];

    return (output.record.copies ?? [])
      .filter(
        (copy) =>
          (!demand || matches(output.record, copy, demand)) &&
          !(output.assignments[copy.id] ?? []).some((assignment) => !assignment.returnedAt) &&
          !pendingReprint(purchases, output.record, copy),
      )
      .map((copy) => ({ key, copy, record: output.record }));
  });
}

function assignedQuantity(purchases, build, partId) {
  return Object.values(purchases)
    .flatMap((entry) => Object.values(entry.printOutput?.assignments ?? {}))
    .flat()
    .filter(
      (assignment) =>
        !assignment.returnedAt && sameBuildOwner(assignment.build, build) && assignment.demand.partId === partId,
    ).length;
}

function checkedCopyRequest(request) {
  if (
    !text(request.request) ||
    request.request.length > 200 ||
    !text(request.copy) ||
    !text(request.demand?.partId) ||
    !text(request.demand.key) ||
    !text(request.demand.material) ||
    !Number.isInteger(request.demand.qty) ||
    request.demand.qty < 1 ||
    request.demand.qty > 50
  )
    throw new Error('Choose a printed copy for the frozen demand.');
}

function replayCopy(purchases, request, previous) {
  const recorded = request.kind === 'assign' ? previous.request : previous.returnRequest;

  if (recorded !== request.request || !same(previous.build, request.build) || !same(previous.demand, request.demand))
    throw new Error('This allocation request has changed.');

  return purchases;
}

function returnCopy({ purchases, request, now, output, copy, history, owner }) {
  if (!owner || !sameBuildOwner(owner.build, request.build)) throw new Error('Choose a copy assigned to this build.');

  const assignments = history.map((assignment) =>
    assignment === owner ? { ...assignment, returnedAt: now, returnRequest: request.request } : assignment,
  );

  return {
    ...purchases,
    [request.key]: { printOutput: { ...output, assignments: { ...output.assignments, [copy.id]: assignments } } },
  };
}

function changeCopy(purchases, request, now) {
  checkedBuild(request.build);

  checkedCopyRequest(request);

  const output = purchases[request.key]?.printOutput;
  const copy = output?.record.copies?.find((item) => item.id === request.copy);

  if (!copy || !matches(output.record, copy, request.demand))
    throw new Error('The printed copy differs from the frozen part.');

  const history = output.assignments[copy.id] ?? [];
  const owner = history.find((assignment) => !assignment.returnedAt);
  const previous = history.find(
    (assignment) => assignment.request === request.request || assignment.returnRequest === request.request,
  );

  if (previous) return replayCopy(purchases, request, previous);

  if (request.kind === 'return-copy') return returnCopy({ purchases, request, now, output, copy, history, owner });

  if (history.length >= 1000) throw new Error('Print allocation history is full.');

  if (owner || !availablePrintCopies(purchases, request.demand).some((entry) => entry.copy.id === copy.id))
    throw new Error('The printed copy is unavailable.');

  if (assignedQuantity(purchases, request.build, request.demand.partId) >= request.demand.qty)
    throw new Error('The frozen printed-part demand is already assigned.');

  const assignments = [...history, { build: request.build, demand: request.demand, request: request.request, at: now }];

  return {
    ...purchases,
    [request.key]: { printOutput: { ...output, assignments: { ...output.assignments, [copy.id]: assignments } } },
  };
}

export function allocatePrintOutput(purchases, request, now) {
  if (request.kind === 'print') return savePrint(purchases, request.record);

  if (request.kind === 'assign' || request.kind === 'return-copy') return changeCopy(purchases, request, now);

  throw new Error('Choose an allocation.');
}
