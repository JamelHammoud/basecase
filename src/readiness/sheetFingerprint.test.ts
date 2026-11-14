import { Matrix4 } from 'three';
import { describe, expect, it } from 'vitest';
import { sheetPart } from '../sheet/sheet.fixtures';
import { DEFAULT_PROJECT } from '../types/robotics';
import { fallsKey, walkKey } from '../workspace/storedWalk';
import { readinessFingerprint } from './readiness';

describe('sheet edits invalidate measured build results', () => {
  const original = sheetPart({ sheet: { material: 'carbon-fiber', thicknessMm: 3 } });
  const key = (part: typeof original) => readinessFingerprint([part], {});

  it.each([
    { sheet: { material: 'acrylic' as const, thicknessMm: 3 } },
    { sheet: undefined },
    { sheetTransform: new Matrix4().makeScale(1, 1, 2).toArray() },
  ])('invalidates Checks, peak torque and fall evidence for %j', (patch) => {
    const changed = { ...original, ...patch };

    expect(key(changed)).not.toBe(key(original));
    expect(walkKey([changed], DEFAULT_PROJECT)).not.toBe(walkKey([original], DEFAULT_PROJECT));
    expect(fallsKey([changed], DEFAULT_PROJECT)).not.toBe(fallsKey([original], DEFAULT_PROJECT));
  });
});
