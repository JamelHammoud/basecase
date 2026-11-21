import { expect, it } from 'vitest';
import { readStoredTry, storedTryOf, summaryOf, summaryRecord, tryRecordOf } from './tryFile';
import { multipliable, type TryRecord } from './tries';

it('retains branch provenance and ancestry through portable manifests and ordinary summaries', () => {
  const record: TryRecord = {
    id: 'branch',
    caseId: 'case',
    robot: 'Arm',
    at: '2026-11-20T00:00:00.000Z',
    passed: true,
    margin: 1,
    seconds: 2,
    manifest: {
      formatVersion: 1,
      caseHash: 'a'.repeat(64),
      modelHash: 'b'.repeat(64),
      frames: 100,
      dt: 0.02,
      seed: 0,
      source: 'parent',
      commands: 3,
      branch: { version: 1, checkpoint: 'c'.repeat(64), frame: 50, time: 1 },
    },
  };
  const stored = storedTryOf(record, { sceneId: 'scene', caseName: 'Case', joints: ['joint'], input: null });
  const reopened = readStoredTry(JSON.parse(JSON.stringify(stored)))!;

  expect(reopened.sourceTry).toBe('parent');
  expect(reopened.branch).toEqual(record.manifest.branch);
  expect(tryRecordOf(reopened).manifest.branch).toEqual(record.manifest.branch);
  expect(summaryRecord(summaryOf(reopened, { recording: true, strip: false })).manifest.branch).toEqual(
    record.manifest.branch,
  );
  expect(multipliable(tryRecordOf(reopened))).toBe(false);

  for (const malformed of [
    { ...stored, sourceTry: null },
    { ...stored, branch: { ...stored.branch, version: 2 } },
    { ...stored, branch: { ...stored.branch, checkpoint: 'other' } },
    { ...stored, branch: { ...stored.branch, frame: -1 } },
  ])
    expect(readStoredTry(malformed)).toBeNull();
});
