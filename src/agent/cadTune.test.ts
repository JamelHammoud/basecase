import { describe, expect, it } from 'vitest';
import { clampNumber } from '../design-system/numberInputMath';
import { dimensionRows, tunedCad, withTunedPart } from './cadTune';
import { BRACKET_CODE, bracketAndServo, tunedAnswer } from './fixtures/tunedBracket';
import { findPort, worldPort } from './ports';

const portAt = (parts: ReturnType<typeof bracketAndServo>, id: string, name: string) => {
  const part = parts.find((p) => p.id === id)!;

  return worldPort(part, findPort(part, name)!).position;
};

describe('Dimensions rows', () => {
  it('reads each tunable number with the range its Customizer comment gives', () => {
    expect(dimensionRows(BRACKET_CODE)).toEqual([{ name: 'wall', value: 2, min: 1, max: 6, step: 0.5, precision: 2 }]);
  });

  it('clamps typed values to that range', () => {
    const [wall] = dimensionRows(BRACKET_CODE);

    expect([9, 0.2, 2.5].map((v) => clampNumber(v, wall))).toEqual([6, 1, 2.5]);
  });
});

describe('a tuned part', () => {
  it('replaces the part with the new code and mesh, and moves what is mated to it', () => {
    const parts = bracketAndServo();
    const tuned = tunedCad(tunedAnswer(3), undefined);

    if ('error' in tuned) throw new Error(tuned.error);

    const after = withTunedPart(parts, 'bracket', tuned.cad);
    const servoRise = after[1].position[1] - parts[1].position[1];

    expect(after[0].cad?.code).toContain('wall = 3;');
    expect(after[0].cad?.baseSize[1]).toBeCloseTo(3);
    expect(servoRise).toBeCloseTo(1);
    portAt(after, 'servo', 'idler').forEach((v, k) => expect(v).toBeCloseTo(portAt(after, 'bracket', 'top')[k], 2));
    expect(parts[0].cad?.code).toBe(BRACKET_CODE);
  });

  it('keeps the old part when the result breaks a requirement', () => {
    const answer = tunedAnswer(1);
    const result = answer.result as { audit: { checks: unknown[] } };

    result.audit.checks = [{ name: 'min wall', want: '1.6 mm', got: 'thinnest sampled 1 mm', pass: false }];

    expect(tunedCad(answer, { min_wall_mm: 1.6 })).toEqual({
      error: 'min wall needs 1.6 mm, got thinnest sampled 1 mm',
    });
  });

  it('reports a compile error by its first line', () => {
    const answer = {
      code: BRACKET_CODE,
      result: new TextEncoder().encode('{"ok":false,"error":"Parser error at line 4\\nmore"}'),
    };

    expect(tunedCad(answer, undefined)).toEqual({ error: 'Parser error at line 4' });
  });
});
