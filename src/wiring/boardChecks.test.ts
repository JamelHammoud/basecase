import { describe, expect, it } from 'vitest';
import { inspectElectrical } from './electricalChecks';
import { electricalProjection } from './electrical';
import { box } from '../sim/fixtures/parts';
import { component, sceneOf } from './fixtures';
import type { ElectronicsBoard } from './boardTypes';

describe('board readiness integration', () => {
  it('keeps mechanical fit separate from every earlier electrical blocker', async () => {
    const host = box('board', [0, 50, 0], [5, 1.6, 5], 5);
    const scene = sceneOf([host, component('xl', 'dynamixel-xl330-m288')], []);
    const earlier = electricalProjection(scene);
    const definition: ElectronicsBoard = {
      schema: 1,
      partId: 'board',
      outline: 'rectangle',
      side: 'top',
      heightMm: { top: 30, bottom: 5 },
      edgeClearanceMm: 1,
      holes: [],
      keepouts: [],
      placements: [
        {
          id: 'connector',
          productId: 'jst-b3b-eh-a',
          position: [0, 0],
          rotation: 0,
          locked: true,
          bindings: ['1', '2', '3'].map((pin) => ({ pad: pin, partId: 'xl', port: 'bus-in', pin })),
        },
      ],
    };

    scene.project.electronicsBoard = definition;

    const result = await inspectElectrical(scene);
    const mechanical = result.rows.find((row) => row.check === 'Board fit');
    const electrical = result.rows.find((row) => row.check === 'Electrical connections');

    expect(mechanical?.status).toBe('fail');
    expect(mechanical?.items?.some((item) => item.text.includes('inside the board outline'))).toBe(true);
    expect(electrical?.status).toBe('fail');
    expect(electrical?.items?.map((item) => item.text)).toEqual(
      expect.arrayContaining(earlier.requirements.map((item) => item.detail)),
    );
    expect(electrical?.items?.some((item) => item.text.includes('copper connections'))).toBe(true);
    expect(new Set(result.findings.map((finding) => finding.key)).size).toBe(result.findings.length);
  });
});
