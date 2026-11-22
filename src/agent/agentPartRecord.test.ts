import { describe, expect, it } from 'vitest';
import type { CadAudit } from '../types/cadAudit';
import { partCode, partRecord } from './agentPartRecord';
import { specToPart } from './agentScene';

const audit: CadAudit = { bodies: 1, genus: 2, nonManifoldEdges: 0, openEdges: 0, hullVolume: 9000 };

const cadPart = (id: string, name: string) =>
  specToPart({
    id,
    name,
    shape: 'cad_part',
    cad: {
      language: 'openscad',
      code: 'cube(10);',
      positions: [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 0, 10],
      indices: [0, 1, 2, 0, 2, 3],
      stats: { volume: 1000 },
      audit,
      expect: { genus: 2 },
      ports: [{ name: 'top', position: [5, 5, 10], axis: [0, 0, 1], kind: 'face', check: 'ok' }],
    },
  });

describe('part records', () => {
  const parts = [cadPart('left-shoulder-yoke', 'Left Shoulder Yoke'), cadPart('left-thigh', 'Left Thigh')];

  it('keeps the audit, requirements and ports on the part', () => {
    expect(partRecord(parts, 'left-thigh')).toEqual({ exists: true, volume: 1000, audit, expect: { genus: 2 } });
    expect(parts[0].cad?.ports?.[0].name).toBe('top');
    expect(partRecord(parts, 'nope')).toEqual({ exists: false });
  });

  it('returns plain code, and suggests the closest ids for a guessed one', () => {
    expect(partCode(parts, 'left-thigh')).toEqual({ text: 'left-thigh (openscad):\ncube(10);' });
    expect(partCode(parts, 'shoulder-yoke-left').error).toMatch(/Closest CAD parts: left-shoulder-yoke, left-thigh\.$/);
  });
});
