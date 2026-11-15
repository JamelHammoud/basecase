import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PanelSpec } from '../../cases/console/panelKinds';
import { type SignalTrack } from '../../cases/console/recordedSignals';
import type { Simulation } from '../../sim/useSimulation';
import type { PanelContext } from './panelContext';
import { CaseRunArea } from './CaseRunArea';

export const HZ = 50;
export const SECONDS = 120;
export const JOINTS = ['left', 'right', 'pan', 'tilt'];

export function roverTrack(): SignalTrack {
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

export function context(bus: PanelContext['bus'], seek?: (time: number) => void): PanelContext {
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

export const draw = (ctx: PanelContext) =>
  renderToStaticMarkup(
    createElement(CaseRunArea, {
      area: { key: 'right', at: 1, size: 320, panels: PANELS, last: false },
      side: 'after',
      ctx,
      header: null,
    }),
  );
