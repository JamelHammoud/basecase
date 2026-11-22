import { expect, it } from 'vitest';
import { specToPart } from '../agent/agentScene';
import { booleanPart } from '../booleans/parts';
import { editWithOperands } from '../booleans/operands';
import { readinessFingerprint, currentReadiness, readinessOf } from './readiness';

it('invalidates Checks as soon as a boolean operand changes, before replacement geometry is ready', () => {
  const plate = specToPart({ id: 'plate', shape: 'box', size: [80, 60, 8] });
  const bore = specToPart({ id: 'bore', shape: 'cylinder', size: [8, 8, 20] });
  const cut = {
    ...booleanPart({ id: 'cut', base: plate, tools: [bore], op: 'subtract' }),
    mesh: { positions: [0, 0, 0], indices: [], baseSize: [80, 8, 60] as [number, number, number] },
  };
  const before = [cut];
  const fingerprint = readinessFingerprint(before, {});
  const measured = readinessOf([], { parts: before, fingerprint });
  const after = editWithOperands(before, (parts) =>
    parts.map((part) => (part.id === 'bore' ? { ...part, position: [12, 0, 0] } : part)),
  );

  expect(after[0].mesh).toBe(cut.mesh);
  expect(readinessFingerprint(after, {})).not.toBe(fingerprint);
  expect(currentReadiness(measured, readinessFingerprint(after, {}))).toBeNull();
  expect(currentReadiness(measured, readinessFingerprint(before, {}))).toBe(measured);
});
