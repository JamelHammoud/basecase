import { describe, expect, it } from 'vitest';
import { galleryBundleOf } from '../../gallery/buildBundle';
import { galleryBundleBytes, readGalleryBundleBytes } from '../../gallery/galleryBundle';
import { fixtureRobots } from '../../sim/fixtures/robots';
import { parseCase, touchTheDots } from '../testing';
import {
  addPanel,
  checkedConsole,
  editableConsole,
  movePanel,
  removePanel,
  renamePanel,
  resizeArea,
  type PanelPlace,
} from './consoleEdits';
import type { CaseConsole } from './format';
import { DEFAULT_CONSOLE } from './layout';

const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;

const PLOTTED: CaseConsole = {
  input: ['keys'],
  panels: [
    { id: 'brief', kind: 'text', of: 'brief' },
    { id: 'reach', kind: 'plot', title: 'Reach', signals: ['joint.*.position'] },
    { id: 'tries', kind: 'list', of: 'tries' },
  ],
  layout: {
    areas: [{ size: 300, panels: ['brief'] }, { canvas: true }, { size: 360, panels: ['reach', 'tries'] }],
  },
};

const caseWith = (console?: CaseConsole) => parseCase({ ...touchTheDots(arm), console });

const columns = (c: CaseConsole) => c.layout.areas.map((a) => ('canvas' in a ? 'canvas' : a.panels));

function saved(console: CaseConsole) {
  const checked = checkedConsole(caseWith(), console);

  if (!checked.ok) throw new Error(checked.problem);

  return checked.kase;
}

const moved = (c: CaseConsole, id: string, to: PanelPlace) => saved(movePanel(c, id, to)).console!;

describe('arranging a console by hand', () => {
  it('moves a plot from the right area into the left one, at the place it was dropped', () => {
    const next = moved(PLOTTED, 'reach', { area: 0, index: 0 });

    expect(columns(next)).toEqual([['reach', 'brief'], 'canvas', ['tries']]);
    expect(columns(moved(PLOTTED, 'reach', { area: 2, index: 2 }))).toEqual([['brief'], 'canvas', ['tries', 'reach']]);
  });

  it('drops an area its last panel leaves, so the format never holds an empty column', () => {
    const next = moved(PLOTTED, 'brief', { area: 2, index: 1 });

    expect(columns(next)).toEqual(['canvas', ['reach', 'brief', 'tries']]);
  });

  it('makes a new column at an area’s edge, keeping the panel’s width, and refuses a seventh', () => {
    const next = moved(PLOTTED, 'tries', { column: 3 });

    expect(columns(next)).toEqual([['brief'], 'canvas', ['reach'], ['tries']]);
    expect(next.layout.areas[3]).toEqual({ size: 360, panels: ['tries'] });

    const crowded: CaseConsole = {
      ...PLOTTED,
      panels: [
        ...PLOTTED.panels,
        { id: 'clock', kind: 'value', signal: 'time' },
        { id: 'map', kind: 'map' },
        { id: 'height', kind: 'value', signal: 'robot.height' },
      ],
      layout: {
        areas: [
          { size: 300, panels: ['brief', 'map', 'height'] },
          { canvas: true },
          { size: 360, panels: ['reach', 'tries', 'clock'] },
        ],
      },
    };
    const six = ['tries', 'clock', 'map'].reduce((c, id) => moved(c, id, { column: c.layout.areas.length }), crowded);

    expect(six.layout.areas).toHaveLength(6);

    const seventh = checkedConsole(caseWith(), movePanel(six, 'height', { column: 0 }));

    expect(seventh).toEqual({ ok: false, problem: 'console.layout.areas holds more than 6 items' });
  });

  it('snaps a column’s width into 200–720 px', () => {
    expect(resizeArea(PLOTTED, 2, 480.4).layout.areas[2]).toEqual({ size: 480, panels: ['reach', 'tries'] });
    expect(resizeArea(PLOTTED, 2, 90).layout.areas[2]).toMatchObject({ size: 200 });
    expect(resizeArea(PLOTTED, 0, 4000).layout.areas[0]).toMatchObject({ size: 720 });
    expect(resizeArea(PLOTTED, 1, 400)).toBe(PLOTTED);
  });

  it('adds a plot of every joint’s position that the format reads, into the area asked or the last one', () => {
    const added = addPanel(PLOTTED, { kind: 'plot', signals: ['joint.*.position'] });
    const kase = saved(added.console);

    expect(added.id).toBe('plot');
    expect(kase.console!.panels.at(-1)).toEqual({ id: 'plot', kind: 'plot', signals: ['joint.*.position'] });
    expect(columns(kase.console!)).toEqual([['brief'], 'canvas', ['reach', 'tries', 'plot']]);

    const again = addPanel(added.console, { kind: 'plot', signals: ['joint.*.effort'] }, 0);

    expect(again.id).toBe('plot-2');
    expect(columns(saved(again.console).console!)[0]).toEqual(['brief', 'plot-2']);
  });

  it('deletes a panel with its place, leaving a valid console', () => {
    const next = saved(removePanel(PLOTTED, 'brief')).console!;

    expect(next.panels.map((p) => p.id)).toEqual(['reach', 'tries']);
    expect(columns(next)).toEqual(['canvas', ['reach', 'tries']]);
  });

  it('renames a panel, and an empty name takes its title away', () => {
    expect(saved(renamePanel(PLOTTED, 'tries', '  Runs ')).console!.panels[2]).toEqual({
      id: 'tries',
      kind: 'list',
      of: 'tries',
      title: 'Runs',
    });
    expect(saved(renamePanel(PLOTTED, 'reach', '')).console!.panels[1]).toEqual({
      id: 'reach',
      kind: 'plot',
      signals: ['joint.*.position'],
    });
  });

  it('refuses an edit that breaks the format with its path, as the agent’s replies do', () => {
    const value = addPanel(PLOTTED, { kind: 'value', signal: 'joint.*.position' });

    expect(checkedConsole(caseWith(), value.console)).toEqual({
      ok: false,
      problem: 'console.panels[3].signal joint.*.position can’t be shown here',
    });
  });

  it('keeps the layout through a reload and a shared Case', () => {
    const kase = saved(resizeArea(movePanel(PLOTTED, 'reach', { area: 0, index: 1 }), 0, 420));
    const reloaded = parseCase(JSON.parse(JSON.stringify(kase)));
    const bundle = galleryBundleOf({
      slug: 'arm-touch-1a2b3c',
      title: 'Arm',
      robotName: 'Arm',
      parts: arm.parts,
      joints: arm.joints,
      kase,
    });

    expect(reloaded.console).toEqual(kase.console);
    expect(readGalleryBundleBytes(galleryBundleBytes(bundle)).case.console).toEqual(kase.console);
    expect(columns(kase.console!)[0]).toEqual(['brief', 'reach']);
  });

  it('edits a copy of the default console for a Case without one, leaving the default as it was', () => {
    const before = JSON.stringify(DEFAULT_CONSOLE);
    const copy = editableConsole(caseWith().console);
    const next = saved(removePanel(copy, 'servos')).console!;

    expect(next.panels.map((p) => p.id)).toEqual(['cameras', 'brief', 'failures', 'tries']);
    expect(JSON.stringify(DEFAULT_CONSOLE)).toBe(before);
  });
});
