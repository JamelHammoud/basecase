import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchPinLayout } from '../components/annotations/pinLayout';
import { box } from '../sim/fixtures/parts';
import type { SceneAnnotation, ScenePart } from '../types/robotics';
import { buildAIHandoffPayload } from './aiHandoff';

const annotation = (id: string, fields: Partial<SceneAnnotation> = {}): SceneAnnotation => ({
  id,
  partId: id,
  position: [1, 2, 3],
  offset: [4, 5, 6],
  comments: [{ id: `${id}-text`, text: `Check ${id}`, createdAt: '2026-11-14T00:00:00Z' }],
  createdAt: '2026-11-14T00:00:00Z',
  ...fields,
});

function pinPositions(annotations: SceneAnnotation[], parts: ScenePart[]) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );

  const projectPoints = vi.fn((points: [number, number, number][]) =>
    points.map(([x, y]) => ({ x, y, visible: true })),
  );
  const stop = watchPinLayout(
    { projectPoints, onRender: () => vi.fn() },
    { shown: annotations, parts, draft: null, activeId: null },
    { layer: {} as HTMLElement, card: null, pins: new Map() },
  );

  stop();

  return projectPoints.mock.calls[0]?.[0] ?? [];
}

afterEach(() => vi.unstubAllGlobals());

describe('annotation attachments across pins and exports', () => {
  it('reads no part IDs for empty batches or comments on the floor', () => {
    let idReads = 0;
    const parts: ScenePart[] = [
      {
        ...box('unused', [0, 0, 0], [10, 10, 10], 100),
        visible: false,
        get id() {
          idReads++;

          return 'unused';
        },
      },
    ];
    const floor = annotation('floor', { partId: null });

    expect(buildAIHandoffPayload('Arm', '', parts).spec.annotations).toEqual([]);
    expect(buildAIHandoffPayload('Arm', '', parts, [floor]).spec.annotations![0].attachedPart).toBeUndefined();
    expect(pinPositions([], parts)).toEqual([]);
    expect(pinPositions([floor], parts)).toEqual([[1, 2, 3]]);
    expect(idReads).toBe(0);
  });

  it('keeps attachment names, world positions, order and replies in both exports', () => {
    const mount = box('mount', [10.4, 20.4, 30.4], [10, 10, 10], 100);
    const parts: ScenePart[] = [
      { ...mount, name: 'Hidden mount', visible: false, rotation: [0, 90, 0] },
      { ...mount, name: 'Duplicate mount', position: [100, 200, 300] },
      { ...box('photo', [40, 50, 60], [10, 10, 10], 0), kind: 'image_plane', name: 'Reference photo' },
    ];
    const annotations = [
      annotation('mount', {
        comments: [
          { id: 'first', text: 'Move the hole', createdAt: '2026-11-14T00:00:00Z' },
          { id: 'reply', text: 'Keep the clearance', createdAt: '2026-11-14T00:00:00Z' },
        ],
      }),
      annotation('photo'),
      annotation('missing'),
      annotation('floor', { partId: null }),
      annotation('no-offset', { partId: 'mount', offset: undefined }),
      annotation('legacy', { partId: undefined }),
      annotation('resolved', { resolved: true }),
      annotation('empty', { comments: [] }),
    ];
    const before = structuredClone({ parts, annotations });
    const { spec, markdown } = buildAIHandoffPayload('Arm', '', parts, annotations);
    const expected = [
      [14.4, 25.4, 36.4],
      [44, 55, 66],
      [1, 2, 3],
      [1, 2, 3],
      [1, 2, 3],
      [1, 2, 3],
    ];

    expect(pinPositions(annotations.slice(0, 6), parts)).toEqual(expected);
    expect(spec.annotations!.map((a) => a.id)).toEqual(annotations.slice(0, 6).map((a) => a.id));
    expect(spec.annotations!.map((a) => Object.values(a.positionMm))).toEqual(
      expected.map((position) => position.map(Math.round)),
    );
    expect(spec.annotations!.map((a) => a.attachedPart)).toEqual([
      'Hidden mount',
      'Reference photo',
      undefined,
      undefined,
      'Hidden mount',
      undefined,
    ]);
    expect(spec.annotations![0].comments).toEqual(['Move the hole', 'Keep the clearance']);
    expect(markdown).toContain('1. At `(14, 25, 36) mm` on **Hidden mount**: Move the hole\n   - Keep the clearance');
    expect(markdown).toContain('2. At `(44, 55, 66) mm` on **Reference photo**: Check photo');
    expect(markdown).toContain('3. At `(1, 2, 3) mm`: Check missing');
    expect(markdown).not.toContain('Check resolved');
    expect(markdown).not.toContain('Check empty');
    expect({ parts, annotations }).toEqual(before);
  });

  it('recomputes attachments after a move, rename, deletion and undo', () => {
    const original = box('mount', [10, 20, 30], [10, 10, 10], 100);
    const moved: ScenePart = { ...original, name: 'Moved mount', position: [40, 50, 60] };
    const annotations = [annotation('mount')];

    for (const parts of [[original], [moved], [], [original]]) {
      const { spec } = buildAIHandoffPayload('Arm', '', parts, annotations);
      const expected = parts.length ? parts[0].position.map((v, i) => v + annotations[0].offset![i]) : [1, 2, 3];

      expect(pinPositions(annotations, parts)).toEqual([expected]);
      expect(Object.values(spec.annotations![0].positionMm)).toEqual(expected);
      expect(spec.annotations![0].attachedPart).toBe(parts[0]?.name);
    }
  });

  it.each([300, 600])('bounds attachment lookup work for %i parts and comments', (count) => {
    let idReads = 0;
    const parts = Array.from({ length: count }, (_, i): ScenePart => ({
      ...box(`part-${i}`, [i, 20, 30], [10, 10, 10], 100),
      visible: false,
      get id() {
        idReads++;

        return `part-${i}`;
      },
    }));
    const annotations = Array.from({ length: count }, (_, i) => annotation(`part-${i}`));
    const { spec } = buildAIHandoffPayload('Arm', '', parts, annotations);
    const exportReads = idReads;

    idReads = 0;

    const points = pinPositions(annotations, parts);

    expect(points).toEqual(Array.from({ length: count }, (_, i) => [i + 4, 25, 36]));
    expect(spec.annotations).toHaveLength(count);
    expect.soft(exportReads).toBeLessThanOrEqual(count * 3);
    expect.soft(idReads).toBeLessThanOrEqual(count * 3);
  });
});
