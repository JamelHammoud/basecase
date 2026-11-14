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
