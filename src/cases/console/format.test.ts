import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../../sim/fixtures/robots';
import { hasInputSource } from '../../sim/inputSources';
import { parseCase, touchTheDots } from '../testing';
import { ARC_CONSOLES } from './fixtures/arcConsoles';
import { consoleLayout, DEFAULT_CONSOLE } from './layout';

const plain = () => JSON.parse(JSON.stringify(touchTheDots(fixtureRobots().find((r) => r.id === 'arm-3dof')!)));

const withConsole = (console: unknown) => () => parseCase({ ...plain(), console });

type Raw = { input: string[]; panels: { id: string; signal?: string }[]; layout: { areas: { panels?: string[] }[] } };

function runnable(example: Record<string, unknown>) {
  const raw = example as unknown as Raw;
  const input = raw.input.filter((id) => hasInputSource(id));
  const dropped = new Set(raw.panels.filter((p) => p.signal === 'camera.operator').map((p) => p.id));

  return {
    ...raw,
    input: input.length ? input : ['keys'],
    panels: raw.panels.filter((p) => !dropped.has(p.id)),
    layout: {
      areas: raw.layout.areas.map((a) => (a.panels ? { ...a, panels: a.panels.filter((id) => !dropped.has(id)) } : a)),
    },
  };
}

const ids = (areas: { panels: { id: string }[] }[]) => areas.map((a) => a.panels.map((p) => p.id));

describe('a Case console', () => {
  it('is optional: a Case without one parses, has none and round-trips unchanged', () => {
    const old = plain();

    delete old.console;

    const parsed = parseCase(old);

    expect(parsed.formatVersion).toBe(1);
    expect('console' in parsed).toBe(false);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(old);
  });

  it('writes the default console in its own format, so the three columns are data', () => {
    const parsed = withConsole(DEFAULT_CONSOLE)();

    expect(parsed.console).toEqual(DEFAULT_CONSOLE);
    expect(parseCase(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it('refuses inputs no source registers, naming the ones arc #184 plans apart from unknown ones', () => {
    const base = DEFAULT_CONSOLE;

    expect(withConsole({ ...base, input: ['camera'] })).toThrow(/console.input\[0\] camera can’t drive a Case/);
    expect(withConsole({ ...base, input: ['midi'] })).toThrow(/console.input\[0\] midi can’t drive/);
    expect(withConsole({ ...base, input: ['mind'] })).toThrow(/console.input\[0\] mind is no input source/);
    expect(withConsole({ ...base, input: ['keys', 'keys'] })).toThrow(/console.input\[1\] repeats keys/);
    expect(withConsole({ ...base, input: [] })).toThrow(/console.input must name an input source/);
    expect(withConsole({ ...base, input: 'keys' })).toThrow(/console.input must be a list/);
  });

  it('refuses unknown panel kinds, bad configs and signals nothing exposes', () => {
    const one = (panel: Record<string, unknown>) =>
      withConsole({
        input: ['keys'],
        panels: [panel],
        layout: { areas: [{ canvas: true }, { size: 300, panels: [panel.id] }] },
      });

    expect(one({ id: 'a', kind: 'radar' })).toThrow(/console.panels\[0\].kind must be one of camera, value/);
    expect(one({ id: 'a', kind: 'value', signal: 'probe.nowhere' })).toThrow(/probe.nowhere names no probe/);
    expect(one({ id: 'a', kind: 'value', signal: 'input.gamepad.forward' })).toThrow(/doesn’t list/);
    expect(one({ id: 'a', kind: 'value', signal: 'joint.elbow.speed' })).toThrow(/must be joint/);
    expect(one({ id: 'a', kind: 'value', signal: 'camera.*' })).toThrow(/can’t be shown here/);
    expect(one({ id: 'a', kind: 'value', signal: 'joint.*.position' })).toThrow(
      /joint.\*.position can’t be shown here/,
    );
    expect(one({ id: 'a', kind: 'plot', signals: ['joint.*.position'] })).not.toThrow();
    expect(one({ id: 'a', kind: 'camera', signal: 'camera.operator' })).toThrow(/needs the camera input/);
    expect(one({ id: 'a', kind: 'plot', signals: [] })).toThrow(/must name a signal/);
    expect(one({ id: 'a', kind: 'plot', signals: ['time'], seconds: 900 })).toThrow(/seconds must be from 2 to 120/);
    expect(one({ id: 'a', kind: 'button', action: 'launch' })).toThrow(/action must be one of try/);
    expect(one({ id: 'a', kind: 'list', of: 'parts' })).toThrow(/of must be one of tries, failures/);
    expect(one({ id: 'a', kind: 'value', signal: 'probe.dot0' })).not.toThrow();
  });

  it('refuses a layout without exactly one canvas, or that drops, repeats or invents a panel', () => {
    const panels = [{ id: 'clock', kind: 'value', signal: 'time' }];
    const laid = (areas: unknown[]) => withConsole({ input: ['keys'], panels, layout: { areas } });

    expect(laid([{ size: 300, panels: ['clock'] }])).toThrow(/must hold the canvas once/);
    expect(laid([{ canvas: true }, { canvas: true }, { size: 300, panels: ['clock'] }])).toThrow(/canvas once/);
    expect(laid([{ canvas: true }])).toThrow(/leaves out clock/);
    expect(laid([{ canvas: true }, { size: 300, panels: ['clock', 'ghost'] }])).toThrow(/places ghost/);
    expect(laid([{ canvas: true }, { size: 300, panels: ['clock', 'clock'] }])).toThrow(/repeats clock/);
    expect(laid([{ canvas: true }, { size: 90, panels: ['clock'] }])).toThrow(/size must be from 200 to 720/);
  });

  it('refuses Case signals that shadow a namespace, repeat, or read a signal declared after them', () => {
    const signals = (list: unknown[]) =>
      withConsole({
        input: ['keys'],
        signals: list,
        panels: [{ id: 'clock', kind: 'value', signal: 'time' }],
        layout: { areas: [{ canvas: true }, { size: 300, panels: ['clock'] }] },
      });

    expect(signals([{ id: 'joint', kind: 'timer' }])).toThrow(/plain name without dots/);
    expect(signals([{ id: 'a.b', kind: 'timer' }])).toThrow(/plain name/);
    expect(
      signals([
        { id: 't', kind: 'timer' },
        { id: 't', kind: 'timer' },
      ]),
    ).toThrow(/repeats t/);
    expect(signals([{ id: 'n', kind: 'counter', when: { signal: 'time' } }])).toThrow(/needs above or below/);
    expect(signals([{ id: 'n', kind: 'counter', when: { signal: 'joint.*.effort', above: 1 } }])).toThrow(
      /when.signal joint.\*.effort can’t be shown here/,
    );
    expect(
      signals([
        { id: 's', kind: 'score', sum: [{ signal: 'n', times: 1 }] },
        { id: 'n', kind: 'timer' },
      ]),
    ).toThrow(/console.signals\[0\].sum\[0\].signal n names no signal/);
  });
});

describe('five consoles from arc #184', () => {
  it('names the inputs this version lacks and refuses them by path', () => {
    const refused = ARC_CONSOLES.flatMap(({ name, console }) => {
      try {
        withConsole(console)();

        return [];
      } catch (e) {
        return [[name, (e as Error).message]];
      }
    });

    expect(refused).toEqual([
      ['G1 arm teleop', 'console.input[0] camera can’t drive a Case in this version'],
      ['Sorting cell', 'console.input[0] policy can’t drive a Case in this version'],
      ['MIDI hexapod', 'console.input[0] midi can’t drive a Case in this version'],
    ]);
  });

  it('parses each once keys stand in for the missing input, and lays out its own areas', () => {
    const laid = ARC_CONSOLES.map(({ console }) => {
      const layout = consoleLayout(withConsole(runnable(console))().console!, { desktop: true });

      return [ids(layout.before), ids(layout.after)];
    });

    expect(laid).toEqual([
      [[['robot-eye']], [['joints', 'arms']]],
      [[['front']], [['map', 'speed']]],
      [[], [['count', 'failures', 'go', 'overhead']]],
      [[['clock', 'score']], [['go', 'reset', 'tries']]],
      [[], [['timeline', 'eye']]],
    ]);
  });
});
