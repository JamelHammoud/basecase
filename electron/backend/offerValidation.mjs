const boundedText = (value) => typeof value === 'string' && value.length <= 2048;
const optionalText = (value) => value === undefined || boundedText(value);
const positive = (value) => Number.isFinite(value) && value > 0 && value <= 1e12;
const count = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 1e12;
const date = (value) =>
  value === undefined ||
  (typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value);
const timestamp = (value) =>
  value === undefined ||
  (boundedText(value) &&
    /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
    date(value.slice(0, 10)) &&
    Number.isFinite(Date.parse(value)));
const identityFields = ['manufacturer', 'mpn', 'supplier', 'supplierPartNumber', 'orderingUnit', 'sourceUrl'];
const validIdentity = (identity) =>
  identity !== null &&
  typeof identity === 'object' &&
  !Array.isArray(identity) &&
  identityFields.every((key) => optionalText(identity[key])) &&
  (identity.unitsPerOrder === undefined || positive(identity.unitsPerOrder));
const validBreak = (item) =>
  item &&
  count(item.minOrders) &&
  item.minOrders > 0 &&
  Number.isFinite(item.price) &&
  item.price >= 0 &&
  item.price <= 1e12;
const validBreaks = (breaks) =>
  Array.isArray(breaks) &&
  breaks.length > 0 &&
  breaks.length <= 32 &&
  breaks.every(validBreak) &&
  new Set(breaks.map((item) => item.minOrders)).size === breaks.length;
const validDates = (offer) =>
  timestamp(offer.observedAt) &&
  timestamp(offer.expiresAt) &&
  date(offer.arrivalEarliest) &&
  date(offer.arrivalLatest) &&
  (!offer.arrivalEarliest || !offer.arrivalLatest || offer.arrivalEarliest <= offer.arrivalLatest);

const validSource = (offer) => ['entered', 'imported'].includes(offer.evidence) && optionalText(offer.importReference);

export function validOffer(offer) {
  return (
    !!offer &&
    boundedText(offer.id) &&
    !!offer.id &&
    validIdentity(offer.identity) &&
    validBreaks(offer.breaks) &&
    (offer.availableOrders === undefined || count(offer.availableOrders)) &&
    typeof offer.currency === 'string' &&
    /^[A-Z]{3}$/.test(offer.currency) &&
    boundedText(offer.destination) &&
    validDates(offer) &&
    boundedText(offer.source) &&
    !!offer.source &&
    validSource(offer)
  );
}

const validEntry = (entry) =>
  entry && validOffer(entry.offer) && boundedText(entry.matchedIdentity) && positive(entry.unitsPerOrder);
const validSelection = (book) =>
  book.selectedId === undefined || book.offers.some((entry) => entry.offer.id === book.selectedId);
const validBook = (book) =>
  book &&
  Array.isArray(book.offers) &&
  book.offers.length <= 500 &&
  book.offers.every(validEntry) &&
  new Set(book.offers.map((entry) => entry.offer.id)).size === book.offers.length &&
  validSelection(book);
const validPlan = (plan) =>
  plan &&
  boundedText(plan.destination) &&
  typeof plan.requiredBy === 'string' &&
  (plan.requiredBy === '' || date(plan.requiredBy));

export function checkedPurchasingEvidence(record) {
  const book = record.supplierOffers;
  const plan = record.purchasePlan;

  if (book !== undefined && !validBook(book)) throw new Error('Check the saved supplier offers.');

  if (plan !== undefined && !validPlan(plan)) throw new Error('Check the purchasing destination and date.');

  const evidence = {
    ...(book !== undefined && { supplierOffers: book }),
    ...(plan !== undefined && { purchasePlan: plan }),
  };

  if (new TextEncoder().encode(JSON.stringify(evidence)).byteLength > 1_048_576)
    throw new Error('Keep saved offers under 1 MiB per item.');

  return evidence;
}
