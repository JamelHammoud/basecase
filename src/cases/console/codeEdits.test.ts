import { describe, expect, it } from 'vitest';
import { withCodePanel, withoutCodePanel } from './codeEdits';
import type { CaseConsole } from './format';
import { DEFAULT_CONSOLE } from './layout';

const SOURCE = '<button>Wave</button>';

const cockpit: CaseConsole = {
  input: ['keys'],
  panels: [
    { id: 'tries', kind: 'list', of: 'tries' },
    { id: 'hud', kind: 'code', source: '<b>0 m/s</b>' },
  ],
  layout: {
    areas: [
      { canvas: true, overlays: [{ panel: 'hud', anchor: 'top-left', width: 200, height: 48 }] },
      { size: 300, panels: ['tries'] },
    ],
  },
};

const edited = (current: CaseConsole | undefined, write: Parameters<typeof withCodePanel>[1]) => {
  const edit = withCodePanel(current, write);

  if (!edit.ok) throw new Error(edit.problem);

  return edit.console;
};

describe('writing a code panel into a console', () => {
  it('starts from the default console, adds code to the input and puts a new panel in the right column', () => {
    const next = edited(undefined, { panel: 'remote', source: SOURCE });

    expect(next.input).toEqual([...DEFAULT_CONSOLE.input, 'code']);
    expect(next.panels.at(-1)).toEqual({ id: 'remote', kind: 'code', source: SOURCE });
    expect(next.layout.areas.at(-1)).toEqual({ size: 328, panels: ['brief', 'failures', 'servos', 'tries', 'remote'] });
  });

  it('replaces a panel’s source in place, keeping its title, height and overlay', () => {
    const next = edited(cockpit, { panel: 'hud', source: '<b>1 m/s</b>' });

    expect(next.panels[1]).toEqual({ id: 'hud', kind: 'code', source: '<b>1 m/s</b>' });
    expect(next.layout).toEqual(cockpit.layout);
  });

  it('moves a panel to a new place, opening a column on the left and dropping the empty overlay list', () => {
    const next = edited(cockpit, { panel: 'hud', source: SOURCE, place: { side: 'left', size: 240 } });

    expect(next.layout.areas).toEqual([
      { size: 240, panels: ['hud'] },
      { canvas: true },
      { size: 300, panels: ['tries'] },
    ]);
  });

  it('places a panel over the canvas', () => {
    const next = edited(cockpit, {
      panel: 'stick',
      source: SOURCE,
      place: { overlay: 'bottom', height: 160, pointer: true },
    });

    expect(next.layout.areas[0]).toEqual({
      canvas: true,
      overlays: [
        { panel: 'hud', anchor: 'top-left', width: 200, height: 48 },
        { panel: 'stick', anchor: 'bottom', height: 160, pointer: true },
      ],
    });
  });

  it('refuses to turn a built-in panel into code, and leaves a full input as it is', () => {
    expect(withCodePanel(cockpit, { panel: 'tries', source: SOURCE })).toEqual({
      ok: false,
      problem: 'tries is a list panel. Name the code panel something else.',
    });
    expect(
      edited({ ...cockpit, input: ['keys', 'gamepad', 'phone', 'camera'] }, { panel: 'x', source: SOURCE }).input,
    ).toEqual(['keys', 'gamepad', 'phone', 'camera']);
  });

  it('takes a code panel out of the panels and the layout, and refuses a panel that isn’t code', () => {
    const next = withoutCodePanel(cockpit, 'hud');

    expect(next.ok && next.console.panels.map((p) => p.id)).toEqual(['tries']);
    expect(next.ok && next.console.layout.areas[0]).toEqual({ canvas: true });
    expect(withoutCodePanel(cockpit, 'tries')).toEqual({
      ok: false,
      problem: 'This Case has no code panel named tries.',
    });
  });
});
