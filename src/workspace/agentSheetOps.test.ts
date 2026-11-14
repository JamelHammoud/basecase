import { describe, expect, it, vi } from 'vitest';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { specToPart } from '../agent/agentScene';
import type { AgentCadPayload } from '../agent/cadMesh';
import { detectSheet } from '../sheet/detectSheet';
import { plateTriangles } from '../sheet/sheet.fixtures';
import type { ScenePart } from '../types/robotics';
import type { SheetProfile } from '../types/sheet';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { localTriangles } from '../three/meshMeasure';
import { applyAgentOps, type AgentOpsContext } from './applyAgentOps';

function stage(tilt = false) {
  const triangles = plateTriangles({ tilt });
  const cad: AgentCadPayload = {
    language: 'openscad',
    code: 'cube([80,60,3]);',
    positions: Array.from(triangles),
    indices: Array.from({ length: triangles.length / 3 }, (_, i) => i),
  };
  const initial = specToPart({
    id: 'chest',
    shape: 'cad_part',
    cad,
  });
  const local = new Float32Array(initial.cad!.positions);
  const profile = detectSheet(local)!;
  const measureParts = vi.fn(async (): Promise<Record<string, { sheet?: SheetProfile }>> => ({
    chest: { sheet: profile },
  }));
  let parts: ScenePart[] = [initial];
  const ctx: AgentOpsContext = {
    current: () => parts,
    commitParts: (change) => {
      parts = change(parts);
    },
    viewport: () =>
      ({ measureParts, animateSpawn: () => {}, meshesReady: async () => [] }) as unknown as Viewport3DHandle,
    setCursor: () => {},
    setAction: () => {},
    isFollowing: () => false,
    guard: () => null,
    touch: () => {},
  };

  return { parts: () => parts, ctx, measureParts, initial, cad };
}

describe('agent sheet updates', () => {
  it('creates a circular sheet and resizes it against its new measured profile', async () => {
    const { parts, ctx } = stage();
    const added = await applyAgentOps(
      [
        {
          op: 'add',
          part: { id: 'disc', shape: 'cylinder', size: [80, 80, 3], sheet: { material: 'acrylic', thicknessMm: 3 } },
        },
      ],
      ctx,
    );

    expect(added).toContain('added disc');

    const resized = await applyAgentOps([{ op: 'update', part: { id: 'disc', size: [100, 100, 6] } }], ctx);
    const disc = parts().find((part) => part.id === 'disc')!;
    const group = buildPartGroup(disc, false);
    const profile = detectSheet(localTriangles(group));

    releasePartGroup(group);
    expect(resized).toContain('updated disc');
    expect(disc.sheet).toEqual({ material: 'acrylic', thicknessMm: 3 });
    expect(profile?.thicknessMm).toBeCloseTo(3);
    expect(disc.dimensions.width).toBe(100);
  });

  it('refuses sheet conversion when the same request bevels the measured flat faces', async () => {
    const { ctx, parts } = stage();
    const plate = specToPart({ id: 'box', size: [80, 60, 3] });

    ctx.commitParts(() => [plate]);

    const summary = await applyAgentOps(
      [
        {
          op: 'update',
          part: { id: 'box', edges: { kind: 'chamfer', mm: 1 }, sheet: { material: 'acrylic', thicknessMm: 3 } },
        },
      ],
      ctx,
    );

    expect(summary).toContain('Problems:');
    expect(parts()).toEqual([plate]);
  });
});

describe('agent sheet measurement during hand edits', () => {
  it('preserves edits made while the existing sheet profile is measured', async () => {
    const { parts, ctx, measureParts } = stage();
    const measured = await measureParts();

    measureParts.mockImplementationOnce(async () => {
      ctx.commitParts((current) => current.map((part) => ({ ...part, name: 'Renamed plate', position: [12, 34, 56] })));

      return measured;
    });

    await applyAgentOps([{ op: 'update', part: { id: 'chest', sheet: { material: 'acrylic', thicknessMm: 3 } } }], ctx);

    expect(parts()[0].sheet?.material).toBe('acrylic');
    expect(parts()[0].name).toBe('Renamed plate');
    expect(parts()[0].position).toEqual([12, 34, 56]);
  });

  it('refuses an obsolete measurement after the source geometry changes', async () => {
    const { parts, ctx, measureParts } = stage();
    const measured = await measureParts();

    measureParts.mockImplementationOnce(async () => {
      ctx.commitParts((current) => current.map((part) => ({ ...part, dimensions: { ...part.dimensions, height: 9 } })));

      return measured;
    });

    const summary = await applyAgentOps(
      [{ op: 'update', part: { id: 'chest', sheet: { material: 'acrylic', thicknessMm: 3 } } }],
      ctx,
    );

    expect(summary).toContain('Problems:');
    expect(parts()[0].sheet).toBeUndefined();
    expect(parts()[0].dimensions.height).toBe(9);
  });
});

describe('agent CAD sheet updates', () => {
  it('measures an incoming CAD mesh before adding its sheet setting', async () => {
    const { parts, ctx, measureParts, cad } = stage();
    const summary = await applyAgentOps(
      [
        {
          op: 'add',
          part: { id: 'new-plate', shape: 'cad_part', cad, sheet: { material: 'acrylic', thicknessMm: 4.6 } },
        },
      ],
      ctx,
    );
    const added = parts().find((part) => part.id === 'new-plate')!;
    const group = buildPartGroup(added, false);
    const profile = detectSheet(localTriangles(group))!;

    releasePartGroup(group);
    expect(summary).toContain('added new-plate');
    expect(measureParts).not.toHaveBeenCalled();
    expect(added.sheet).toEqual({ material: 'acrylic', thicknessMm: 4.5 });
    expect(profile.thicknessMm).toBeCloseTo(4.5);
    expect(profile.holes).toHaveLength(4);
  });

  it('measures the existing CAD part before changing its stock thickness', async () => {
    const { parts, ctx, measureParts } = stage();
    const summary = await applyAgentOps(
      [{ op: 'update', part: { id: 'chest', sheet: { material: 'carbon-fiber', thicknessMm: 2 } } }],
      ctx,
    );
    const updated = parts()[0];
    const group = buildPartGroup(updated, false);
    const profile = detectSheet(localTriangles(group))!;

    releasePartGroup(group);

    expect(summary).toContain('updated chest');
    expect(measureParts).toHaveBeenCalledWith(['chest']);
    expect(updated.sheet).toEqual({ material: 'carbon-fiber', thicknessMm: 2.01 });
    expect(profile.thicknessMm).toBeCloseTo(2.01);
    expect(profile.holes).toHaveLength(4);
  });

  it('reports a refused sheet update without changing the part', async () => {
    const { parts, ctx, measureParts, initial } = stage();

    measureParts.mockResolvedValue({ chest: {} });

    const summary = await applyAgentOps(
      [{ op: 'update', part: { id: 'chest', sheet: { material: 'carbon-fiber', thicknessMm: 2 } } }],
      ctx,
    );

    expect(summary).toContain('Problems:');
    expect(parts()[0]).toBe(initial);
  });

  it.each([false, true])('replaces a CAD sheet with tilt=%s without scaling its stock twice', async (tilted) => {
    const { parts, ctx, cad } = stage(tilted);

    const first = await applyAgentOps(
      [{ op: 'update', part: { id: 'chest', sheet: { material: 'carbon-fiber', thicknessMm: 2 } } }],
      ctx,
    );

    expect(first).toContain('updated chest');
    expect(Boolean(parts()[0].sheetTransform)).toBe(tilted);

    await applyAgentOps([{ op: 'update', part: { id: 'chest', cad } }], ctx);

    const group = buildPartGroup(parts()[0], false);
    const profile = detectSheet(localTriangles(group))!;

    releasePartGroup(group);
    expect(parts()[0].sheet).toEqual({ material: 'carbon-fiber', thicknessMm: 2.01 });
    expect(profile.thicknessMm).toBeCloseTo(2.01);
    expect(profile.holes).toHaveLength(4);
  });
});
