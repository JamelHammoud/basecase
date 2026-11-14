import { describe, expect, it } from 'vitest';
import { saluteMotion } from '../cameras/gestures/fixtures/gestures';
import { GESTURE_FEATURES } from '../cameras/gestures/gestureFrame';
import { exampleFrom } from '../cameras/gestures/gestureRecognizer';
import { fixtureRobots } from '../sim/fixtures/robots';
import { createSignalBus } from './console/signalBus';
import { gestureNames, MAX_TAUGHT_GESTURES, untaught, withGesture, type CaseGesture } from './gestures';
import { parseCase, touchTheDots } from './testing';

const plain = () => JSON.parse(JSON.stringify(touchTheDots(fixtureRobots().find((r) => r.id === 'arm-3dof')!)));

const salute = (): CaseGesture => ({ name: 'salute', examples: [0, 1, 2].map((v) => exampleFrom(saluteMotion(v))!) });

const withGestures = (gestures: unknown) => () => parseCase({ ...plain(), gestures });

const frame = () => new Array<number>(GESTURE_FEATURES).fill(0.5);

const panelConsole = (input: string[], panels: unknown[]) => ({
  input,
  panels,
  layout: { areas: [{ canvas: true }, { size: 300, panels: (panels as Array<{ id: string }>).map((p) => p.id) }] },
});

describe('a Case’s gestures', () => {
  it('round-trips a taught gesture through parseCase, examples and all', () => {
    const parsed = withGestures([salute()])();
    const again = parseCase(JSON.parse(JSON.stringify(parsed)));

    expect(again.gestures).toEqual([salute()]);
    expect(again.gestures?.[0].examples).toHaveLength(3);
  });

  it('keeps a declared gesture with no examples as one to teach', () => {
    const parsed = withGestures([{ name: 'salute', examples: [] }])();

    expect(untaught(parsed.gestures).map((g) => g.name)).toEqual(['salute']);
    expect(gestureNames(parsed.gestures)).toContain('salute');
    expect(gestureNames(parsed.gestures)).toContain('wave');
  });

  it('refuses an oversized payload before reading it', () => {
    const many = Array.from({ length: MAX_TAUGHT_GESTURES + 1 }, (_, i) => ({ name: `g${i}`, examples: [] }));
    const long = { name: 'salute', examples: [Array.from({ length: 46 }, frame)] };
    const wide = { name: 'salute', examples: [[new Array<number>(1_000_000).fill(0)]] };
    const extra = { name: 'salute', examples: Array.from({ length: 4 }, () => [frame()]) };

    expect(withGestures(many)).toThrow(/gestures holds more than 8 items/);
    expect(withGestures([long])).toThrow(/gestures\[0\]\.examples\[0\] holds more than 45 items/);
    expect(withGestures([wide])).toThrow(/holds more than 39 items/);
    expect(withGestures([extra])).toThrow(/examples holds more than 3 items/);
  });

  it('refuses a built-in name, a repeat, a bad name and a far-off number', () => {
    expect(withGestures([{ name: 'wave', examples: [] }])).toThrow(/wave is built in/);
    expect(withGestures([salute(), salute()])).toThrow(/repeats a name/);
    expect(withGestures([{ name: 'Salute!', examples: [] }])).toThrow(/short lowercase name/);
    expect(withGestures([{ name: 'salute', examples: [[frame().map(() => 1e6)]] }])).toThrow(/past 10/);
  });

  it('replaces a gesture taught again under the same name', () => {
    const first = withGesture([], { name: 'salute', examples: [] });

    expect(withGesture(first, salute())).toEqual([salute()]);
    expect(withGesture(first, { name: 'bow', examples: [] }).map((g) => g.name)).toEqual(['salute', 'bow']);
  });
});

describe('gesture signals in a console', () => {
  it('reads gesture.<name> for built-in and taught gestures with the camera input', () => {
    const plot = { id: 'plot', kind: 'plot', signals: ['gesture.wave', 'gesture.salute'] };
    const button = { id: 'go', kind: 'button', action: 'try', gesture: 'thumbs-up' };
    const parsed = parseCase({
      ...plain(),
      gestures: [{ name: 'salute', examples: [] }],
      console: panelConsole(['camera'], [plot, button]),
    });

    expect(parsed.console?.panels).toContainEqual(button);
  });

  it('refuses a gesture signal without the camera, or a gesture the Case doesn’t have', () => {
    const plot = (signal: string) => ({ id: 'plot', kind: 'plot', signals: [signal] });

    expect(() => parseCase({ ...plain(), console: panelConsole(['keys'], [plot('gesture.wave')]) })).toThrow(
      /gesture.wave needs the camera input/,
    );
    expect(() => parseCase({ ...plain(), console: panelConsole(['camera'], [plot('gesture.salute')]) })).toThrow(
      /gesture.salute names no gesture of this Case/,
    );
    expect(() =>
      parseCase({
        ...plain(),
        console: panelConsole(['camera'], [{ id: 'go', kind: 'button', action: 'try', gesture: 'bow' }]),
      }),
    ).toThrow(/bow names no gesture of this Case/);
  });

  it('shows a gesture as a pulse on the bus', () => {
    const bus = createSignalBus();
    const sample = { time: 0, running: false, joints: [], robot: {}, probes: {}, inputs: {}, goal: null, cameras: [] };

    bus.push({ ...sample, gestures: { wave: 1 } });
    expect(bus.read('gesture.wave')).toBe(1);
    bus.push({ ...sample, time: 1, gestures: { wave: 0 } });
    expect(bus.read('gesture.wave')).toBe(0);
  });
});
