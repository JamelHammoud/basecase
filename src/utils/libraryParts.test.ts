import { describe, expect, it } from 'vitest';
import type { CustomModelDefinition } from '../types/robotics';
import { modelNote, modelToParts } from './libraryParts';

const model = (description: string): CustomModelDefinition => ({
  id: 'model-1',
  name: 'Bracket',
  description,
  createdAt: '2026-11-13T00:00:00Z',
  sourceType: 'agent-acp',
  defaultDimensions: { width: 40, height: 20, depth: 10, thickness: 4 },
  defaultColor: '#d4d4d8',
  mechanicalTag: '3D Printed PLA/PETG',
  nodes: [],
});

describe('modelNote', () => {
  it('drops the lines the app used to write and keeps what someone wrote', () => {
    expect(modelNote(model('Saved from 52 parts'))).toBe('');
    expect(modelNote(model('Saved from scene (box)'))).toBe('');
    expect(
      modelNote(model('3D model generated via ACP from reference image (8 contour vertices, 0 internal holes).')),
    ).toBe('');
    expect(modelNote(model('Holds the wrist servo; print with 4 walls'))).toBe(
      'Holds the wrist servo; print with 4 walls',
    );
  });

  it('gives an inserted model only the note someone wrote', () => {
    const id = () => 'part-1';

    expect(modelToParts(model('Saved from scene (box)'), [0, 0, 0], id).parts[0].note).toBe('');
    expect(modelToParts(model('Snap-fit lid'), [0, 0, 0], id).parts[0].note).toBe('Snap-fit lid');
  });
});
