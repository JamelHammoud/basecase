import { expect, it } from 'vitest';
import { continuationDriveClass } from './continuationDrive';
import type { Controller } from './engine';

it('admits only retained manual arm, rover and pose controllers, including a single robot team', () => {
  const pose = {
    kind: 'drive',
    setup: { kind: 'pose', robot: 'arm', joints: [], start: {}, rate: 1 },
  } satisfies Controller;

  expect(continuationDriveClass(pose)).toBe('pose');
  expect(
    continuationDriveClass({ kind: 'drive', setup: { kind: 'team', members: [{ slot: 0, setup: pose.setup }] } }),
  ).toBe('pose');
  expect(
    continuationDriveClass({ kind: 'drive', setup: { kind: 'team', members: [{ slot: 1, setup: pose.setup }] } }),
  ).toBeNull();
  expect(continuationDriveClass({ kind: 'hold' })).toBeNull();
  expect(continuationDriveClass({ kind: 'limp' })).toBeNull();
  expect(continuationDriveClass({ kind: 'drive', setup: { kind: 'team', members: [] } })).toBeNull();
});
