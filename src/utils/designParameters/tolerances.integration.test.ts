import { describe, expect, it, vi } from 'vitest';
import { TOLERANCE_MECHANISMS, toleranceFixture } from './tolerances.fixtures';
import { analyzeTolerances, validateRequirements } from './tolerances';
import { editParameterDesign } from './edits';
import { prepareParameterEdit } from './transaction';
import { rememberParameterDesign, parameterVerificationTargets } from './verification';
import { resolveParameters } from './resolve';

function independentCorners(index: number) {
  const [, a, b, loA, hiA, loB, hiB] = TOLERANCE_MECHANISMS[index];
  const values = [a + loA - (b + loB), a + loA - (b + hiB), a + hiA - (b + loB), a + hiA - (b + hiB)];

  return { nominal: a - b, minimum: Math.min(...values), maximum: Math.max(...values) };
}

describe('authored manufacturing stacks', () => {
  it.each(TOLERANCE_MECHANISMS.map(([name], index) => ({ name, index })))(
    '$name bounds agree with independent corners',
    ({ index }) => {
      const design = toleranceFixture(index);
      const [result] = analyzeTolerances(design);
      const expected = independentCorners(index);

      expect(result.nominal).toBeCloseTo(expected.nominal, 10);
      expect(result.minimum).toBeCloseTo(expected.minimum, 10);
      expect(result.maximum).toBeCloseTo(expected.maximum, 10);
      expect(result.status).toBe(expected.minimum < 0 ? 'fail' : 'pass');
      expect(result.contributors.map((item) => item.parameter)).toEqual(['inner', 'outer']);
    },
  );

  it('combines a shared variable before bounding and retains independent dimensions', () => {
    const design = toleranceFixture();

    design.requirements[0].expression = 'outer - inner + inner - outer + 0.2 mm';
    expect(analyzeTolerances(design)[0]).toMatchObject({ nominal: 0.2, minimum: 0.2, maximum: 0.2, status: 'pass' });
    design.requirements[0].expression = 'outer - 2 * inner';
    expect(analyzeTolerances(design)[0].minimum).toBeCloseTo(30.2 - 2 * 30.25);
  });

  it('refuses nonlinear expressions, incompatible units, missing contributors and bad intervals', () => {
    for (const expression of [
      'outer * inner / inner',
      'outer / inner * 1 mm',
      'outer + 1 deg',
      'outer * (inner / 1 mm)',
    ]) {
      const design = toleranceFixture();

      design.requirements[0].expression = expression;
      expect(() => validateRequirements(design)).toThrow();
      expect(analyzeTolerances(design)[0].status).toBe('unresolved');
    }

    const design = toleranceFixture();

    design.requirements[0].minimum = 2;
    expect(() => validateRequirements(design)).toThrow();
    design.requirements[0].minimum = 0;
    design.requirements[0].dimensions.pop();
    expect(() => validateRequirements(design)).toThrow();
  });

  it('never turns absent data or fit choices into manufacturing evidence', () => {
    const design = toleranceFixture();

    delete design.parameters[0].tolerance;
    expect(analyzeTolerances(design)[0]).toMatchObject({ status: 'unresolved', minimum: null, maximum: null });
    design.parameters[0].tolerance = { lower: 1, upper: -1 };
    expect(() => resolveParameters(design.parameters)).toThrow();
    design.parameters[0].unit = 'deg';
    expect(() => resolveParameters(design.parameters)).toThrow();
  });

  it('preserves rename and refuses freezing away referenced manufacturing variation', () => {
    const renamed = editParameterDesign(toleranceFixture(), { op: 'rename', name: 'inner', to: 'spacer' });

    expect(renamed.requirements![0].expression).toBe('outer - spacer');
    expect(analyzeTolerances(renamed)[0].status).toBe('fail');
    expect(() => editParameterDesign(renamed, { op: 'delete', name: 'spacer', resolution: 'freeze' })).toThrow();
    renamed.parts.pop();
    expect(analyzeTolerances(renamed)[0].status).toBe('unresolved');
  });

  it('changes tolerance evidence without compiling or regenerating nominal geometry', async () => {
    const before = toleranceFixture();

    rememberParameterDesign(before.parts, before.parameters);

    const design = editParameterDesign(before, {
      op: 'set',
      parameter: { ...before.parameters[1], tolerance: { lower: 0, upper: 0 } },
    });
    const compile = vi.fn();
    const regenerate = vi.fn();
    const result = await prepareParameterEdit(design, {
      compile,
      regenerate,
      isCurrent: () => true,
      force: parameterVerificationTargets(before, design, [{ op: 'set', parameter: design.parameters[1] }]),
    });

    expect(compile).not.toHaveBeenCalled();
    expect(regenerate).not.toHaveBeenCalled();
    expect(result.parts.every((part, i) => part === before.parts[i])).toBe(true);
    expect(analyzeTolerances(result)[0].status).toBe('pass');
    await expect(prepareParameterEdit(design, { compile, regenerate, isCurrent: () => false })).rejects.toThrow();

    const controller = new AbortController();

    controller.abort();
    await expect(
      prepareParameterEdit(design, { compile, regenerate, isCurrent: () => true, signal: controller.signal }),
    ).rejects.toThrow();
  });
});
