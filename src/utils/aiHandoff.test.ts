import { describe, expect, it } from 'vitest';
import { box, type P3 } from '../sim/fixtures/parts';
import { buildAIHandoffPayload, inferSpatialRelationships } from './aiHandoff';

const intentSection = (markdown: string) => {
  const lines = markdown.split('\n');
  const start = lines.indexOf('## 1. High-Level Design Intent');

  return lines.slice(start + 1, start + 3);
};

describe('buildAIHandoffPayload', () => {
  it('puts the scene description under the design intent', () => {
    const { markdown } = buildAIHandoffPayload('Rover', 'Four-wheel rover that climbs a 20 mm step', []);

    expect(intentSection(markdown)).toEqual(['Four-wheel rover that climbs a 20 mm step', '']);
  });

  it('goes straight to the envelope when the scene has no description', () => {
    const { markdown } = buildAIHandoffPayload('Rover', '', []);

    expect(intentSection(markdown)[0]).toMatch(/^- \*\*Overall Envelope/);
    expect(markdown).not.toContain('No global note');
  });
});

it('shares envelope and contact bounds while preserving visibility, order and later edits', () => {
  const parts = [
    box('base', [0, 0, 0], [10, 10, 10], 100),
    { ...box('cut', [15, 0, 0], [10, 10, 10], 0), role: 'cutout' as const },
    { ...box('axis', [0, 10, 0], [2, 2, 2], 0), role: 'reference' as const },
    { ...box('hidden', [1000, 0, 0], [10, 10, 10], 100), visible: false },
    { ...box('photo', [2000, 0, 0], [10, 10, 10], 0), kind: 'image_plane' as const },
  ];
  const before = structuredClone(parts);
  const { spec, markdown } = buildAIHandoffPayload('Arm', '', parts);

  expect(spec.boundingBoxMm).toEqual({ width: 25, height: 16, depth: 10 });
  expect(spec.parts.map((part) => part.id)).toEqual(['base', 'cut', 'axis']);
  expect(spec.spatialRelationships).toEqual(inferSpatialRelationships(parts));
  expect(spec.spatialRelationships).toHaveLength(2);

  for (const relation of spec.spatialRelationships) expect(markdown).toContain(relation);

  expect(parts).toEqual(before);

  const edited = parts.map((part) => ({ ...part, visible: part.id === 'cut', position: [100, 0, 0] as P3 }));
  const next = buildAIHandoffPayload('Arm', '', edited).spec;

  expect(next.boundingBoxMm).toEqual({ width: 10, height: 10, depth: 10 });
  expect(next.spatialRelationships).toEqual([]);
  expect(buildAIHandoffPayload('Arm', '', []).spec.boundingBoxMm).toEqual({ width: 0, height: 0, depth: 0 });
});

it.each([300, 600])('reads each width only for shared bounds and the Markdown row across %i parts', (count) => {
  let reads = 0;
  const parts = Array.from({ length: count }, (_, i) => ({
    ...box(`part-${i}`, [i * 100, 0, 0], [10, 10, 10], 100),
    dimensions: {
      get width() {
        reads++;

        return 10;
      },
      height: 10,
      depth: 10,
    },
  }));
  const { spec } = buildAIHandoffPayload('Arm', '', parts);

  expect(reads).toBe(count * 2);
  expect(spec.boundingBoxMm).toEqual({ width: (count - 1) * 100 + 10, height: 10, depth: 10 });
  expect(spec.spatialRelationships).toEqual([]);
});
