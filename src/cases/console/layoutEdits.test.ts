import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../../sim/fixtures/robots';
import type { Case } from '../schema';
import { parseCase, touchTheDots } from '../testing';
import { withCodePanel } from './codeEdits';
import type { CaseConsole } from './format';
import { DEFAULT_CONSOLE } from './layout';
import { addedPanel, checkedConsole, movedPanel, removedPanel, renamedPanel, resizedArea } from './layoutEdits';
import { consoleScope } from './format';
import { newPanel, panelChoices, picked, ready } from './panelChoices';

const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
const kase = touchTheDots(arm);
const plotted: CaseConsole = {
  ...structuredClone(DEFAULT_CONSOLE),
  panels: [...DEFAULT_CONSOLE.panels, { id: 'plot', kind: 'plot', title: 'Joints', signals: ['joint.*.position'] }],
  layout: {
    areas: [
      { size: 400, panels: ['cameras'] },
      { canvas: true },
      { size: 328, panels: ['brief', 'failures', 'servos', 'tries', 'plot'] },
    ],
  },
};

const saved = (next: CaseConsole): Case => {
  const result = checkedConsole(kase, next);

  if (typeof result === 'string') throw new Error(result);

  return result;
};

const areaPanels = (c: CaseConsole) => c.layout.areas.map((a) => ('panels' in a ? a.panels : 'canvas'));

describe('arranging a console by hand', () => {
  it('drags a plot from the right area to the left, before the cameras or after them', () => {
    expect(areaPanels(movedPanel(plotted, 'plot', { area: 0 }))).toEqual([
      ['cameras', 'plot'],
      'canvas',
      ['brief', 'failures', 'servos', 'tries'],
    ]);
    expect(areaPanels(saved(movedPanel(plotted, 'plot', { area: 0, before: 'cameras' })).console!)[0]).toEqual([
      'plot',
      'cameras',
    ]);
  });

  it('reorders a panel inside its own area', () => {
    const next = movedPanel(plotted, 'tries', { area: 2, before: 'brief' });

    expect(areaPanels(next)[2]).toEqual(['tries', 'brief', 'failures', 'servos', 'plot']);
  });

  it('leaves a panel where it is when it drops on its own slot', () => {
    expect(movedPanel(plotted, 'brief', { area: 2, before: 'brief' }).layout).toEqual(plotted.layout);
    expect(movedPanel(plotted, 'plot', { area: 2, before: 'plot' }).layout).toEqual(plotted.layout);
  });

  it('drops an area its last panel leaves', () => {
    const next = movedPanel(plotted, 'cameras', { area: 2, before: 'brief' });

    expect(areaPanels(saved(next).console!)).toEqual([
      'canvas',
      ['cameras', 'brief', 'failures', 'servos', 'tries', 'plot'],
    ]);
  });

  it('makes a new column at an area’s edge, as wide as the area the panel left, and refuses a seventh', () => {
    const once = movedPanel(plotted, 'plot', { area: 2, column: 'after' });

    expect(areaPanels(saved(once).console!)).toEqual([
      ['cameras'],
      'canvas',
      ['brief', 'failures', 'servos', 'tries'],
      ['plot'],
    ]);
    expect(once.layout.areas[3]).toEqual({ size: 328, panels: ['plot'] });

    const five = movedPanel(once, 'brief', { area: 3, column: 'after' });
    const six = movedPanel(five, 'servos', { area: 0, column: 'before' });

    expect(six.layout.areas).toHaveLength(6);
    expect(saved(six).console!.layout.areas).toHaveLength(6);
    expect(checkedConsole(kase, movedPanel(six, 'tries', { area: 0, column: 'before' }))).toBe(
      'console.layout.areas holds more than 6 items',
    );
  });

  it('keeps the column count when the moved panel was its area’s only one', () => {
    const alone = movedPanel(plotted, 'cameras', { area: 2, column: 'after' });

    expect(areaPanels(alone)).toEqual(['canvas', ['brief', 'failures', 'servos', 'tries', 'plot'], ['cameras']]);
  });

  it('snaps a resize into 200–720 px', () => {
    const sizes = (c: CaseConsole) => c.layout.areas.map((a) => ('size' in a ? a.size : 0));

    expect(sizes(resizedArea(plotted, 2, 90))).toEqual([400, 0, 200]);
    expect(sizes(resizedArea(plotted, 0, 1200.4))).toEqual([720, 0, 328]);
    expect(sizes(saved(resizedArea(plotted, 0, 455.6)).console!)).toEqual([456, 0, 328]);
  });

  it('adds a valid plot of joint.*.position through the picker every kind shares', () => {
    const sources = { scope: consoleScope(DEFAULT_CONSOLE, kase), joints: ['shoulder', 'elbow'], cameras: [] };
    const choices = panelChoices('plot', sources);

    expect(choices.options).toContain('joint.*.position');
    expect(choices.options).toContain('joint.elbow.effort');
    expect(ready(choices, [])).toBe(false);

    const choice = picked(choices, [], 'joint.*.position');
    const { console: next, id } = addedPanel(DEFAULT_CONSOLE, newPanel('plot', choice));
    const parsed = saved(next).console!;

    expect(id).toBe('plot');
    expect(parsed.panels.at(-1)).toEqual({ id: 'plot', kind: 'plot', title: 'Plot', signals: ['joint.*.position'] });
    expect(areaPanels(parsed).at(-1)).toEqual(['brief', 'failures', 'servos', 'tries', 'plot']);
    expect(addedPanel(parsed, newPanel('plot', choice), 0).console.layout.areas[0]).toEqual({
      size: 400,
      panels: ['cameras', 'plot-2'],
    });
  });

  it('offers each kind its own choices, one or many, and builds a panel the format takes', () => {
    const sources = { scope: consoleScope(DEFAULT_CONSOLE, kase), joints: ['shoulder'], cameras: ['wrist_camera'] };
    const table = panelChoices('table', sources);
    const value = panelChoices('value', sources);

    expect(value.options).not.toContain('joint.*.position');
    expect(picked(value, ['time'], 'robot.speed')).toEqual(['robot.speed']);
    expect(picked(table, ['time', 'robot.speed'], 'servos')).toEqual(['servos']);
    expect(picked(table, ['servos'], 'time')).toEqual(['time']);
    expect(panelChoices('camera', sources).options).toEqual(['camera.*', 'camera.wrist_camera']);
    expect(ready(panelChoices('map', sources), [])).toBe(true);

    const all = [
      newPanel('value', ['time']),
      newPanel('table', ['servos']),
      newPanel('table', ['time', 'robot.speed']),
      newPanel('button', ['try']),
      newPanel('list', ['failures']),
      newPanel('text', ['brief']),
      newPanel('map', []),
      newPanel('camera', ['camera.*']),
    ];
    const next = all.reduce((c, p) => addedPanel(c, p).console, DEFAULT_CONSOLE);

    expect(saved(next).console!.panels).toHaveLength(DEFAULT_CONSOLE.panels.length + all.length);
  });

  it('removes a panel from the panels and the layout, and renames one', () => {
    const gone = saved(removedPanel(plotted, 'cameras')).console!;

    expect(gone.panels.map((p) => p.id)).not.toContain('cameras');
    expect(areaPanels(gone)).toEqual(['canvas', ['brief', 'failures', 'servos', 'tries', 'plot']]);
    expect(saved(renamedPanel(plotted, 'plot', 'Arm')).console!.panels.at(-1)!.title).toBe('Arm');
  });

  it('refuses an edit that breaks the format with its path, as the agent’s replies do', () => {
    expect(checkedConsole(kase, movedPanel(plotted, 'plot', { area: 1 }))).toBe('console.layout.areas leaves out plot');

    const coded = withCodePanel(plotted, { panel: 'pad', source: '<p>pad</p>', place: { overlay: 'fill' } });

    expect(coded.ok && checkedConsole(kase, movedPanel(coded.console, 'plot', { area: 1 }))).toBe(
      'console.layout.areas leaves out plot',
    );
  });

  it('saves the layout in the Case, so a reload or a shared Case opens it the same', () => {
    const edited = saved(resizedArea(movedPanel(plotted, 'plot', { area: 0 }), 0, 512));
    const reopened = parseCase(JSON.parse(JSON.stringify(edited)));

    expect(reopened.console).toEqual(edited.console);
    expect(reopened.console!.layout.areas[0]).toEqual({ size: 512, panels: ['cameras', 'plot'] });
  });

  it('edits a copy of the default console, never the default itself', () => {
    const before = JSON.stringify(DEFAULT_CONSOLE);
    const next = saved(movedPanel(structuredClone(DEFAULT_CONSOLE), 'tries', { area: 0 }));

    expect(areaPanels(next.console!)[0]).toEqual(['cameras', 'tries']);
    expect(JSON.stringify(DEFAULT_CONSOLE)).toBe(before);
  });
});
