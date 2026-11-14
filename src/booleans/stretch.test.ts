import { describe, expect, it } from 'vitest';
import { hardwareDimensions, type HardwareSpec } from '../data/hardware';
import type { ScenePart } from '../types/robotics';
import { evaluateBoolean, knownResult } from './evaluate';
import { booleanHash } from './hash';
import { editWithOperands } from './operands';
import { booleanPart, withResult, type BooleanPart, type NewBoolean } from './parts';
import { partsWithResults } from './results';
import { resizeReason, stretchOf } from './stretch';

type Vec3 = [number, number, number];

const part = (over: Partial<ScenePart> & Pick<ScenePart, 'id' | 'kind'>): ScenePart => ({
  name: over.id,
  category: 'primitives',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 40, height: 20, depth: 30 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  ...over,
});

const SCREW: HardwareSpec = { type: 'socket_head', size: 'M3', length: 20 };

const screw = part({
  id: 'screw',
  kind: 'hardware',
  name: 'M3 Screw',
  category: 'hardware',
  hardware: SCREW,
  position: [0, 20, 0],
  dimensions: hardwareDimensions(SCREW),
});

const plate = part({ id: 'plate', kind: 'box', name: 'Plate', position: [0, 20, 0] });

const pin = part({ id: 'pin', kind: 'box', position: [0, 20, 0], dimensions: { width: 2, height: 2, depth: 2 } });

async function made(spec: NewBoolean): Promise<BooleanPart> {
  const draft = booleanPart(spec);

  return withResult(draft, booleanHash(draft), await evaluateBoolean(draft));
}

async function resized(result: BooleanPart, width: number) {
  const [edited] = editWithOperands([result], (parts) =>
    parts.map((p) => (p.id === result.id ? { ...p, dimensions: { ...p.dimensions, width } } : p)),
  ) as BooleanPart[];

  await evaluateBoolean(edited);

  const [cut] = partsWithResults([edited], knownResult) as BooleanPart[];

  return { edited, cut };
}

describe('stretching a boolean', () => {
  it('keeps the width a screw sets, so the field never shows a width the cut puts back', async () => {
    const result = await made({ id: 'u', base: { ...pin, id: 'pin-base' }, tools: [screw], op: 'union' });
    const was = result.dimensions.width;
    const { edited, cut } = await resized(result, was * 2);

    expect(edited.dimensions.width).toBe(cut.dimensions.width);
    expect(cut.dimensions.width).toBe(was);
    expect(stretchOf(result)).toEqual({ fixed: [true, true, true], by: expect.objectContaining({ id: 'screw' }) });
    expect(resizeReason(stretchOf(result))).toBe('M3 Screw keeps its shape. Select it in Layers to move or resize it.');
  });

  it('stretches a plate with a screw subtracted, keeping the hole the screw’s size', async () => {
    const result = await made({ id: 's', base: { ...plate, id: 'plate-base' }, tools: [screw], op: 'subtract' });
    const { cut } = await resized(result, 80);

    expect(stretchOf(result).fixed).toEqual([false, false, false]);
    expect(resizeReason(stretchOf(result))).toBeNull();
    expect(cut.dimensions.width).toBeCloseTo(80, 3);
    expect(cut.boolean.operands[1].dimensions).toEqual(screw.dimensions);
  });

  it('holds only the round sides of a tube that sets the edge, turned with it', async () => {
    const tube = part({
      id: 'tube',
      kind: 'tube',
      position: [0, 20, 0],
      dimensions: { width: 50, height: 40, depth: 50, thickness: 4 },
    });
    const upright = await made({ id: 't', base: { ...plate, id: 'p1' }, tools: [tube], op: 'union' });
    const lying = await made({
      id: 'l',
      base: { ...plate, id: 'p2' },
      tools: [{ ...tube, rotation: [0, 0, 90] as Vec3 }],
      op: 'union',
    });

    expect(stretchOf(upright).fixed).toEqual([true, false, true]);
    expect(stretchOf(lying).fixed).toEqual([false, true, true]);
  });

  it('frees a plain union to stretch to the width typed', async () => {
    const result = await made({
      id: 'b',
      base: { ...plate, id: 'p3' },
      tools: [{ ...pin, position: [25, 20, 0] }],
      op: 'union',
    });
    const { cut } = await resized(result, 120);

    expect(stretchOf(result)).toEqual({ fixed: [false, false, false], by: null });
    expect(cut.dimensions.width).toBeCloseTo(120, 3);
  });

  it('stretches a plate with a tube boss and a screw inside it to the width typed', async () => {
    const slab = part({
      id: 'slab',
      kind: 'box',
      position: [0, 20, 0],
      dimensions: { width: 100, height: 30, depth: 60 },
    });
    const boss = part({
      id: 'boss',
      kind: 'tube',
      position: [20, 30, 0],
      dimensions: { width: 20, height: 40, depth: 20, thickness: 3 },
    });
    const result = await made({
      id: 'm',
      base: slab,
      tools: [boss, { ...screw, position: [-20, 20, 0] }],
      op: 'union',
    });
    const { cut } = await resized(result, 200);

    expect(stretchOf(result)).toEqual({ fixed: [false, false, false], by: null });
    expect(cut.dimensions.width).toBeCloseTo(200, 3);
  });
});
