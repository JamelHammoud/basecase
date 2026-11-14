import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PanelSpec } from '../../cases/console/panelKinds';
import { recordedBus, type SignalTrack } from '../../cases/console/recordedSignals';
import type { Simulation } from '../../sim/useSimulation';
import type { PanelContext } from './panelContext';
import { CaseRunArea } from './CaseRunArea';

const HZ = 50;
const SECONDS = 120;
const JOINTS = ['left', 'right', 'pan', 'tilt'];

function roverTrack(): SignalTrack {
  const frames = SECONDS * HZ;
  const t = Array.from({ length: frames }, (_, n) => n / HZ);
  const angle = (n: number) => (n / frames) * Math.PI * 2;
  const numbers = new Map<string, number[]>([
    ['time', t],
    ['robot.x', t.map((_, n) => 1000 * Math.cos(angle(n)))],
    ['robot.z', t.map((_, n) => 1000 * Math.sin(angle(n)))],
    ['robot.speed', t.map((_, n) => 0.5 + 0.1 * Math.sin(n / 10))],
    ...JOINTS.map((j, i): [string, number[]] => [`joint.${j}.position`, t.map((s) => 30 * Math.sin(s + i))]),
  ]);

  return { t, numbers, labels: new Map([['goal.failed', t.map(() => [])]]) };
}

const PANELS: PanelSpec[] = [
  { id: 'wheels', kind: 'plot', signals: ['joint.*.position'] },
  { id: 'speed', kind: 'plot', signals: ['robot.speed'], seconds: 10 },
  { id: 'map', kind: 'map' },
  { id: 'x', kind: 'value', signal: 'robot.x' },
  { id: 'clock', kind: 'value', signal: 'time' },
  { id: 'all', kind: 'table', of: 'signals', signals: ['robot.speed', 'robot.x', 'robot.z'] },
];

function context(bus: PanelContext['bus'], seek?: (time: number) => void): PanelContext {
  return {
    bus,
    signals: [],
    scope: { declared: new Set(), probes: new Set(), inputs: new Set() },
    inputs: [],
    brief: '',
    world: { objects: [], place: (p) => p },
    sim: { drive: { cls: null }, model: null, worldParts: [] } as unknown as Simulation,
    parts: [],
    joints: [],
    fire: () => undefined,
    can: () => false,
    seek,
    studio: null,
  };
}

const draw = (ctx: PanelContext) =>
  renderToStaticMarkup(
    createElement(CaseRunArea, {
      area: { key: 'right', size: 320, panels: PANELS, last: false },
      side: 'after',
      ctx,
      header: null,
    }),
  );

const playheadX = (html: string) => Number(/data-testid="trace-playhead" d="M([\d.]+) /.exec(html)?.[1]);

describe('panels over a played try', () => {
  it('plot the whole try with the playhead where it is, and draw the rover’s whole path on the map', () => {
    const bus = recordedBus(roverTrack());

    bus.seek(SECONDS * HZ * 0.25);

    const html = draw(context(bus, () => undefined));

    expect(html).toContain('data-playhead="30.00"');
    expect(playheadX(html)).toBeCloseTo(250, 0);
    expect(html.match(/data-testid="trace-joint\.\w+\.position"/g)).toHaveLength(JOINTS.length);
    expect(html).toContain(`data-lines="${JOINTS.length}"`);
    expect(Number(/data-path="(\d+)"/.exec(html)?.[1])).toBeGreaterThan(500);
    expect(html).toContain('data-testid="map-robot"');
    expect(html).toMatch(/data-signal="time">30.0 s</);
    expect(html).toMatch(/data-signal="robot.x">[^<]*0</);
  });

  it('repaints six panels on a two-minute try within a frame after a seek', () => {
    const bus = recordedBus(roverTrack());
    const ctx = context(bus, () => undefined);
    const times: number[] = [];

    for (let i = 0; i < 50; i++) {
      const started = performance.now();

      bus.seek(Math.round((((i * 37) % 50) / 50) * SECONDS * HZ));
      draw(ctx);
      times.push(performance.now() - started);
    }

    const settled = times.slice(10).sort((a, b) => a - b);

    expect(settled[Math.floor(settled.length / 2)]).toBeLessThan(16);
  });
});
