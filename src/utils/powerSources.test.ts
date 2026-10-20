import { describe, expect, it } from 'vitest';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { CheckContext } from './engineeringTypes';
import { findPowerSource } from './powerSources';

const component = (id: string, componentId: string): ScenePart => ({
  id,
  name: id,
  kind: 'component',
  componentId,
  category: 'sensors',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#fff',
  note: '',
  visible: true,
  locked: false,
});

const context = (parts: ScenePart[]) => ({ parts, project: {} as ProjectSettings }) as unknown as CheckContext;

describe('findPowerSource', () => {
  it('reads a LiPo pack from Parts → Power', () => {
    expect(findPowerSource(context([component('pack', 'ovonic-3s-2200-50c')]))?.battery).toMatchObject({
      nominalV: 11.1,
      fullV: 12.6,
      capacityAh: 2.2,
    });
  });

  it('builds a pack from a holder and its cells', () => {
    const source = findPowerSource(
      context([
        component('holder', 'mpd-bk-18650-pc4'),
        component('cell1', 'molicel-p28a'),
        component('cell2', 'molicel-p28a'),
      ]),
    );

    expect(source?.battery).toMatchObject({ nominalV: 3.6, fullV: 4.2, capacityAh: 5.6 });
  });

  it('prefers a pack over loose cells and falls back to supplies', () => {
    const pack = findPowerSource(context([component('cell', 'molicel-p42a'), component('pack', 'ovonic-2s-2200-50c')]));
    const supply = findPowerSource({
      parts: [],
      project: { extras: [{ key: 'supply:lipo-2s-2200', qty: 1 }] },
    } as unknown as CheckContext);

    expect(pack?.name).toContain('2S');
    expect(supply?.battery).toMatchObject({ fullV: 8.4 });
  });
});
