const MAX_TEXT = 1024 * 1024;
const MAX_SAMPLES = 1024;
const WINDOW_MS = 20_000;

const validValues = (values, joints, nullable) =>
  Array.isArray(values) &&
  values.length === joints &&
  values.every((value) => (nullable && value === null) || (typeof value === 'number' && Number.isFinite(value)));

function sampleOf(text, joints) {
  try {
    const line = JSON.parse(text);

    if (!line || !Number.isFinite(line.t) || line.t < 0 || !Number.isFinite(line.t * 1000)) return null;

    if (line.k !== 'status' && line.k !== 'intent') return null;

    if (!validValues(line.q, joints, line.k === 'status')) return null;

    return { kind: line.k, at: line.t * 1000, values: line.q };
  } catch {
    return null;
  }
}

export function readRecordedRun(sink, recording) {
  if (!recording || !sink?.read) return null;

  const text = sink.read(recording.id);

  if (typeof text !== 'string' || text.length > MAX_TEXT) return null;

  const samples = text.split('\n').flatMap((line) => {
    const sample = sampleOf(line, recording.joints.length);

    return sample ? [sample] : [];
  });
  const newest = samples.at(-1)?.at;

  if (newest === undefined) return null;

  const recent = samples.filter((sample) => sample.at >= newest - WINDOW_MS && sample.at <= newest);
  const statuses = recent
    .filter((sample) => sample.kind === 'status')
    .slice(-MAX_SAMPLES)
    .map(({ at, values }) => ({ at, positions: values }));
  const first = statuses[0]?.at ?? newest;
  const goals = samples.filter((sample) => sample.kind === 'intent' && sample.at <= newest);
  const previous = goals.findLast((sample) => sample.at < first);
  const selected = goals.filter((sample) => sample.at >= first).slice(previous ? 1 - MAX_SAMPLES : -MAX_SAMPLES);

  if (previous) selected.unshift(previous);

  const intents = selected.map(({ at, values }) => ({ at, joints: values }));

  return statuses.length
    ? { joints: [...recording.joints], statuses, intents, faultJoint: null, faultAt: 0, message: '' }
    : null;
}
