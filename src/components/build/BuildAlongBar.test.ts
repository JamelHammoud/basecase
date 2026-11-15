import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BuildAlongStep } from '../../guide/buildAlong';
import { readySteps } from '../../print/tracker';
import { shapeKey } from '../../print/shapeKey';
import { box } from '../../sim/fixtures/parts';
import type { PrintRecord } from '../../types/robotics';
import type { BuildAlong } from '../../workspace/useBuildAlong';
import { BuildAlongBar } from './BuildAlongBar';

const parts = ['base', 'arm'].map((id) => box(id, [0, 0, 0], [20, 20, 20], 50));
const records: PrintRecord[] = [
  {
    id: 'arm-print',
    plate: 1,
    material: 'PLA',
    hash: 'arm-plate',
    parts: [{ id: 'arm', key: shapeKey(parts[1]) }],
    printer: 'default',
    sentAt: '2026-11-14T00:00:00.000Z',
    state: 'printed',
  },
];
const step: BuildAlongStep = { shown: [], moves: [], arrows: [], callout: [], servos: [], routes: [], tools: [] };

function toolbar(index: number, repairPhase?: BuildAlongStep['repairPhase']) {
  const buildAlong = { active: true, index, count: 2, step: { ...step, repairPhase } } as BuildAlong;
  const ready = readySteps([['base'], ['arm']], { parts, records, keyOf: shapeKey });

  return renderToStaticMarkup(createElement(BuildAlongBar, { buildAlong, active: true, ready, onPrint: () => {} }));
}

describe('Build Along print readiness', () => {
  it('marks the printed step in the toolbar and leaves an unprinted step unmarked', () => {
    expect(toolbar(0)).toContain('data-step="1"');
    expect(toolbar(0)).not.toContain('data-ready');
    expect(toolbar(1)).toContain('data-step="2"');
    expect(toolbar(1)).toContain('data-ready="true"');
  });

  it('leaves teardown unmarked even when its parts are printed', () => {
    expect(toolbar(1, 'remove')).not.toContain('data-ready');
  });
});
