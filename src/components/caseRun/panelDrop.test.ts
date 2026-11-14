import { describe, expect, it } from 'vitest';
import { createSignalBus } from '../../cases/console/signalBus';
import { busNames, kindLabel, panelChoices } from './panelChoices';
import { dropMark, dropPlace, inFlow, type DropGeometry } from './panelDrop';

const GEOMETRY: DropGeometry = {
  areas: [
    { at: 0, left: 0, right: 408, top: 0, bottom: 800, panels: [{ id: 'cameras', top: 0, bottom: 300 }] },
    {
      at: 2,
      left: 1100,
      right: 1436,
      top: 0,
      bottom: 800,
      panels: [
        { id: 'brief', top: 60, bottom: 200 },
        { id: 'tries', top: 200, bottom: 600 },
      ],
    },
  ],
  canvas: { at: 1, left: 408, right: 1100, top: 0, bottom: 800 },
};

describe('dropping a dragged panel', () => {
  it('lands between panels by their middles, or at an edge as a new column', () => {
    expect(dropPlace(GEOMETRY, 1250, 100)).toEqual({ area: 2, index: 0 });
    expect(dropPlace(GEOMETRY, 1250, 150)).toEqual({ area: 2, index: 1 });
    expect(dropPlace(GEOMETRY, 1250, 700)).toEqual({ area: 2, index: 2 });
    expect(dropPlace(GEOMETRY, 200, 500)).toEqual({ area: 0, index: 1 });
    expect(dropPlace(GEOMETRY, 1110, 300)).toEqual({ column: 2 });
    expect(dropPlace(GEOMETRY, 1430, 300)).toEqual({ column: 3 });
    expect(dropPlace(GEOMETRY, 420, 300)).toEqual({ column: 1 });
    expect(dropPlace(GEOMETRY, 1080, 300)).toEqual({ column: 2 });
    expect(dropPlace(GEOMETRY, 750, 300)).toBeNull();
  });

  it('counts a hidden empty panel where it sits in the column, not at the top of the window', () => {
    const panels = inFlow(
      [
        { id: 'brief', top: 60, bottom: 200 },
        { id: 'failures', top: 0, bottom: 0 },
        { id: 'tries', top: 200, bottom: 600 },
      ],
      0,
    );
    const withHidden = { ...GEOMETRY, areas: [GEOMETRY.areas[0], { ...GEOMETRY.areas[1], panels }] };

    expect(panels[1]).toEqual({ id: 'failures', top: 200, bottom: 200 });
    expect(dropPlace(withHidden, 1250, 100)).toEqual({ area: 2, index: 0 });
    expect(dropPlace(withHidden, 1250, 150)).toEqual({ area: 2, index: 1 });
    expect(dropPlace(withHidden, 1250, 300)).toEqual({ area: 2, index: 2 });
  });

  it('marks where it lands: a line between panels, or down the column’s edge', () => {
    expect(dropMark(GEOMETRY, { area: 2, index: 1 })).toEqual({ left: 1100, top: 198.5, width: 336, height: 3 });
    expect(dropMark(GEOMETRY, { column: 3 })).toEqual({ left: 1434.5, top: 0, width: 3, height: 800 });
    expect(dropMark(GEOMETRY, { column: 1 })).toEqual({ left: 406.5, top: 0, width: 3, height: 800 });
  });
});

describe('Add Panel’s choices', () => {
  const bus = createSignalBus([{ id: 'clock', kind: 'timer', seconds: 30 }]);
  const scope = { declared: new Set(['clock']), probes: new Set<string>(), inputs: new Set(['keys']) };

  bus.push({
    time: 1,
    running: false,
    joints: [{ id: 'shoulder', target: 0, position: 10, effort: 0.2 }],
    robot: { height: 120 },
    probes: {},
    inputs: { keys: null },
    goal: null,
    cameras: ['wrist_camera'],
  });

  const names = busNames(bus, ['keys']);
  const labels = (kind: Parameters<typeof panelChoices>[0]) => panelChoices(kind, names, scope).map((c) => c.label);

  it('lists the bus’s names, with every joint’s position for a plot', () => {
    expect(names).toEqual(
      expect.arrayContaining(['joint.*.position', 'time', 'clock', 'joint.shoulder.position', 'robot.height']),
    );
    expect(panelChoices('plot', names, scope)[1]).toEqual({
      label: 'joint.*.position',
      draft: { kind: 'plot', signals: ['joint.*.position'] },
    });
  });

  it('offers each kind only what its reader takes', () => {
    expect(labels('value')).not.toContain('joint.*.position');
    expect(labels('value')).toEqual(expect.arrayContaining(['joint.shoulder.position', 'clock', 'input.keys.turn']));
    expect(labels('camera')).toEqual(['camera.*', 'camera.wrist_camera']);
    expect(labels('button')).toEqual(['Try It', 'Stop Try', 'Drive', 'Stop Driving', 'Start Over', 'Reset']);
    expect(labels('map')).toEqual(['Map']);
    expect(labels('list')).toEqual(['Tries', 'Failures']);
    expect(kindLabel('plot')).toBe('Plot');
  });
});
