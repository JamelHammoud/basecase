import { allocatePrintOutput } from './printAllocations.mjs';

const MAX_OWNERS = 1000;
const MAX_EVENTS = 1000;
const token = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200;
const count = (value) => Number.isSafeInteger(value) && value > 0 && value <= 100000;

export function allocatedCount(record) {
  const reservations = record?.reservations ?? [];

  if (
    !Array.isArray(reservations) ||
    reservations.length > MAX_OWNERS ||
    reservations.some((entry) => !Number.isInteger(entry.quantity) || entry.quantity < 0 || entry.quantity > 100000)
  )
    throw new Error('The allocation history is damaged.');

  return reservations.reduce((sum, entry) => sum + entry.quantity, 0);
}

export function preserveAllocations(record, previous, update = 'full') {
  const fields = update === 'stock' ? stockFields(record, previous) : { ...record };

  delete fields.reservations;
  delete fields.printOutput;

  if (update === 'price') retainStock(fields, previous);

  const production = {
    ...(previous?.reservations && { reservations: previous.reservations }),
    ...(previous?.printOutput && { printOutput: previous.printOutput }),
  };

  return Object.keys(fields).length || Object.keys(production).length ? { ...fields, ...production } : null;
}

function stockFields(record, previous) {
  const fields = { ...previous };

  if (record?.onHand) fields.onHand = record.onHand;
  else delete fields.onHand;

  return fields;
}

function retainStock(fields, previous) {
  delete fields.onHand;

  if (previous?.onHand !== undefined) fields.onHand = previous.onHand;
}

export function checkedBuild(build) {
  if (!token(build?.id) || !token(build.name) || !/^[a-f0-9]{64}$/.test(build.kit))
    throw new Error('Choose a saved build.');
}

function checkedReference(purchases, build) {
  checkedBuild(build);

  const owners = Object.values(purchases).flatMap((record) => [
    ...(record.reservations ?? []).map((entry) => entry.build),
    ...Object.values(record.printOutput?.assignments ?? {})
      .flat()
      .map((entry) => entry.build),
  ]);

  if (owners.some((owner) => owner.id === build.id && owner.kit !== build.kit))
    throw new Error('The frozen component demand has changed.');
}

function checkedComponent(request) {
  checkedBuild(request.build);

  const demand = request.demand;

  if (
    !token(request.request) ||
    !count(request.quantity) ||
    !token(demand?.key) ||
    !token(demand.name) ||
    !count(demand.qty) ||
    !Array.isArray(demand.partIds) ||
    demand.partIds.length > 10000 ||
    !demand.partIds.every(token) ||
    !/^(component|hardware|supply):/.test(demand.key)
  )
    throw new Error('Choose a whole component quantity within the frozen demand.');
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function checkedReplay(owner, request) {
  const previous = owner?.events.find((event) => event.request === request.request);

  if (previous && (previous.action !== request.kind || previous.quantity !== request.quantity))
    throw new Error('This allocation request has changed.');

  return !!previous;
}

function checkedIdentity(stored, demand) {
  const current = stored?.identity;
  const frozen = demand.identity;

  if (
    current &&
    frozen &&
    ['manufacturer', 'mpn'].some((field) => current[field] && frozen[field] && current[field] !== frozen[field])
  )
    throw new Error('The stock identity differs from the frozen component.');
}

function checkedOwner(owner, request) {
  if (owner && (!same(owner.demand, request.demand) || owner.build.kit !== request.build.kit))
    throw new Error('The frozen component demand has changed.');
}

function checkedHistory(owner, reservations, request) {
  const finalReturn = request.kind === 'return' && request.quantity === owner?.quantity;
  const limit = finalReturn ? MAX_EVENTS : MAX_EVENTS - 1;

  if ((!owner && reservations.length >= MAX_OWNERS) || (owner?.events.length ?? 0) >= limit)
    throw new Error('Allocation history is full.');
}

function checkedQuantity(stored, request, existing) {
  const returning = request.kind === 'return';
  const quantity = existing + (returning ? -request.quantity : request.quantity);

  if (quantity < 0 || quantity > request.demand.qty) throw new Error('Choose a quantity within the frozen demand.');

  if (!returning && request.quantity > Math.max(0, (stored?.onHand ?? 0) - allocatedCount(stored)))
    throw new Error('Unallocated stock doesn’t cover this quantity.');

  if (!returning) checkedIdentity(stored, request.demand);

  return quantity;
}

function changedOwner(owner, request, quantity, now) {
  return {
    build: owner?.build ?? request.build,
    demand: owner?.demand ?? request.demand,
    quantity,
    returned: (owner?.returned ?? 0) + (request.kind === 'return' ? request.quantity : 0),
    events: [
      ...(owner?.events ?? []),
      { request: request.request, action: request.kind, quantity: request.quantity, at: now },
    ],
  };
}

function changeComponent(purchases, request, now) {
  checkedComponent(request);

  const stored = purchases[request.demand.key];
  const reservations = stored?.reservations ?? [];
  const owner = reservations.find((entry) => entry.build.id === request.build.id);

  checkedOwner(owner, request);

  if (checkedReplay(owner, request)) return purchases;

  checkedHistory(owner, reservations, request);

  const quantity = checkedQuantity(stored, request, owner?.quantity ?? 0);
  const next = changedOwner(owner, request, quantity, now);

  return {
    ...purchases,
    [request.demand.key]: { ...stored, reservations: [...reservations.filter((entry) => entry !== owner), next] },
  };
}

export function allocatePurchases(purchases, request, now = new Date().toISOString()) {
  if (!request || typeof request !== 'object') throw new Error('Choose an allocation.');

  if (request.kind !== 'print') checkedReference(purchases, request.build);

  if (request.kind === 'reserve' || request.kind === 'return') return changeComponent(purchases, request, now);

  return allocatePrintOutput(purchases, request, now);
}
