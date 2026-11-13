import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { commandCenterLayout } from './console';
import { parseCase, touchTheDots } from './testing';

const plain = () => JSON.parse(JSON.stringify(touchTheDots(fixtureRobots().find((r) => r.id === 'arm-3dof')!)));

describe('a Case console', () => {
  it('is optional: a Case without one parses, has none and round-trips unchanged', () => {
    const old = plain();

    delete old.console;

    const parsed = parseCase(old);

    expect(parsed.formatVersion).toBe(1);
    expect('console' in parsed).toBe(false);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(old);
    expect(parseCase(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it('parses its input and panels, keeping their order, and round-trips', () => {
    const kase = { ...plain(), console: { input: 'gamepad', panels: ['tries', 'cameras', 'goal'] } };
    const parsed = parseCase(kase);

    expect(parsed.console).toEqual({ input: 'gamepad', panels: ['tries', 'cameras', 'goal'] });
    expect(parseCase(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it('refuses an unknown input or panel, a repeated panel and a wrong shape', () => {
    const kase = plain();
    const withConsole = (console: unknown) => () => parseCase({ ...kase, console });

    expect(withConsole({ input: 'camera', panels: ['cameras'] })).toThrow(/console.input must be one of keys, gamepad/);
    expect(withConsole({ input: 'mind', panels: [] })).toThrow(/console.input/);
    expect(withConsole({ input: 'keys', panels: ['operator'] })).toThrow(/console.panels\[0\] must be one of/);
    expect(withConsole({ input: 'keys', panels: ['radar'] })).toThrow(/console.panels\[0\]/);
    expect(withConsole({ input: 'keys', panels: ['goal', 'goal'] })).toThrow(/repeats a panel/);
    expect(withConsole({ input: 'keys' })).toThrow(/console.panels must be a list/);
    expect(withConsole('keys')).toThrow(/console must be an object/);
    expect(withConsole(null)).toThrow(/console must be an object/);
  });
});

describe('the Command Center layout', () => {
  it('opens every panel with keys when the Case has no console', () => {
    expect(commandCenterLayout(undefined, { desktop: true })).toEqual({
      input: 'keys',
      cameras: true,
      column: ['goal', 'joints', 'tries'],
    });
  });

  it('puts cameras on the side and the rest in the console’s order', () => {
    expect(
      commandCenterLayout({ input: 'gamepad', panels: ['tries', 'joints', 'cameras'] }, { desktop: true }),
    ).toEqual({ input: 'gamepad', cameras: true, column: ['tries', 'joints'] });
    expect(commandCenterLayout({ input: 'keys', panels: ['goal'] }, { desktop: true })).toEqual({
      input: 'keys',
      cameras: false,
      column: ['goal'],
    });
  });

  it('leaves out the joints in the web studio, where there is no Operate', () => {
    expect(commandCenterLayout(undefined, { desktop: false }).column).toEqual(['goal', 'tries']);
  });
});
