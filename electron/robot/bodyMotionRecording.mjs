const HASH = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const COMPLETIONS = ['completed', 'cancelled', 'stale', 'fault', 'disconnect'];

export function checkedMotionRecording(value) {
  const valid =
    value &&
    typeof value === 'object' &&
    value.version === 1 &&
    HASH.test(value.recommendation) &&
    HASH.test(value.sourceKey) &&
    UUID.test(value.connection) &&
    Number.isSafeInteger(value.revision) &&
    value.revision > 0 &&
    COMPLETIONS.includes(value.completion) &&
    value.backend === 'servo-independent-1';

  if (!valid) return null;

  return {
    version: 1,
    recommendation: value.recommendation,
    sourceKey: value.sourceKey,
    connection: value.connection,
    revision: value.revision,
    completion: value.completion,
    backend: value.backend,
  };
}

export function motionRecordingDeclaration(value) {
  if (!value || typeof value !== 'object' || Object.keys(value).sort().join() !== 'recommendation,sourceKey')
    return null;

  return HASH.test(value.recommendation) && HASH.test(value.sourceKey)
    ? { recommendation: value.recommendation, sourceKey: value.sourceKey }
    : null;
}

export function recordedMotionMatches(text, expected) {
  try {
    const lines = text.trim().split('\n');
    const first = JSON.parse(lines[0]);
    const last = JSON.parse(lines.at(-1));
    const actual = checkedMotionRecording({ ...first, completion: expected.completion });
    const ended = last.k === 'motion-end' && last.completion === expected.completion;
    const faulted = expected.completion === 'fault' && last.k === 'fault';

    return (
      first.k === 'motion' &&
      !!actual &&
      JSON.stringify(actual) === JSON.stringify(checkedMotionRecording(expected)) &&
      (ended || faulted)
    );
  } catch {
    return false;
  }
}
