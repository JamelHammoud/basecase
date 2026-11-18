import { describe, expect, it } from 'vitest';
import { specToPart } from '../../agent/agentScene';
import { planParameterEdit } from './plan';
import { renameParameter, removeParameter, parameterDependents } from './mutations';
import type { DesignParameter, DimensionBinding } from './types';

const parameters: DesignParameter[] = [{ name: 'width', unit: 'mm', value: 160 }];
const binding: DimensionBinding = { kind: 'primitive', target: 'width', unit: 'mm', expression: 'width - 16 mm' };
const box = () => ({ ...specToPart({ id: 'deck', shape: 'box', size: [160, 80, 6] }), dimensionBindings: [binding] });

describe('shared dimension target planning', () => {
  it('groups dimensions by identity and leaves unbound parts out of regeneration', () => {
    const part = box();
    const other = specToPart({ id: 'unrelated', shape: 'box' });
    const plan = planParameterEdit([part, other], parameters);

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ part, values: { width: 144 } });
    expect(part.dimensions.width).toBe(160);
  });

  it.each([
    { ...binding, target: 'absent' },
    { ...binding, unit: 'deg' as const },
    { ...binding, expression: 'missing' },
    { ...binding, expression: '-2 mm' },
    { ...binding, kind: 'cad' as const },
    { ...binding, kind: 'sketch' as const },
  ])('refuses unsupported targets and units before geometry work', (dimensionBinding) => {
    expect(() => planParameterEdit([{ ...box(), dimensionBindings: [dimensionBinding] }], parameters)).toThrow(/deck/);
  });

  it('refuses catalog resizing, duplicate identities and conflicting bindings', () => {
    const component = {
      ...specToPart({ id: 'servo', catalog: 'component:feetech-sts3215|c018' }),
      dimensionBindings: [binding],
    };

    expect(() => planParameterEdit([component], parameters)).toThrow(/servo/);
    expect(() => planParameterEdit([box(), box()], parameters)).toThrow(/identity/);
    expect(() => planParameterEdit([{ ...box(), dimensionBindings: [binding, binding] }], parameters)).toThrow(/twice/);
  });

  it('validates numeric CAD targets and refuses clamping or precision loss', () => {
    const part = {
      ...box(),
      kind: 'cad_part' as const,
      cad: {
        language: 'openscad' as const,
        code: 'width = 10; // [1:200]\ncube([width,20,3]);',
        positions: [],
        indices: [],
        originOffset: [0, 0, 0] as [number, number, number],
        baseSize: [10, 3, 20] as [number, number, number],
      },
      dimensionBindings: [{ ...binding, kind: 'cad' as const }],
    };

    expect(planParameterEdit([part], parameters)[0].values).toEqual({ width: 144 });
    expect(() => planParameterEdit([part], [{ name: 'width', unit: 'mm', value: 300 }])).toThrow(/range/);
    expect(() => planParameterEdit([part], [{ name: 'width', unit: 'mm', value: 160.00001 }])).toThrow(/precision/);
  });

  it('renames references atomically and identifies dependents before explicit freezing on deletion', () => {
    const declarations: DesignParameter[] = [
      ...parameters,
      { name: 'spacing', unit: 'mm', expression: 'width - 16 mm' },
    ];
    const part = box();
    const renamed = renameParameter({ parts: [part], parameters: declarations }, 'width', 'chassis');

    expect(renamed.parameters[1]).toMatchObject({ expression: 'chassis - 16 mm' });
    expect(renamed.parts[0].dimensionBindings![0].expression).toBe('chassis - 16 mm');
    expect(part.dimensionBindings![0].expression).toBe('width - 16 mm');
    expect(parameterDependents(renamed, 'chassis')).toEqual(['parameter:spacing', 'deck:primitive:width']);
    expect(() => removeParameter(renamed, 'chassis')).toThrow(/spacing/);

    const frozen = removeParameter(renamed, 'chassis', 'freeze');

    expect(planParameterEdit(frozen.parts, frozen.parameters)[0].values).toEqual({ width: 144 });
    expect(frozen.parameters.map((p) => p.name)).toEqual(['spacing']);
    expect(() => renameParameter(renamed, 'chassis', 'spacing')).toThrow();
  });
});

it('accepts representable decimal arithmetic without mistaking binary rounding for a precision violation', () => {
  const part = {
    ...box(),
    kind: 'cad_part' as const,
    cad: {
      language: 'openscad' as const,
      code: 'width = 1;\ncube([width,20,3]);',
      positions: [],
      indices: [],
      originOffset: [0, 0, 0] as [number, number, number],
      baseSize: [1, 3, 20] as [number, number, number],
    },
    dimensionBindings: [{ kind: 'cad' as const, target: 'width', unit: 'mm' as const, expression: 'a + b' }],
  };

  const [planned] = planParameterEdit(
    [part],
    [
      { name: 'a', unit: 'mm', value: 0.1 },
      { name: 'b', unit: 'mm', value: 0.2 },
    ],
  );

  expect(String(planned.values.width)).toBe('0.3');
});
