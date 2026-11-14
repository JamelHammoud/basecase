import { describe, expect, it } from 'vitest';
import { galleryBundleOf } from '../../gallery/buildBundle';
import { parseGalleryBundle } from '../../gallery/galleryBundle';
import { fixtureRobots } from '../../sim/fixtures/robots';
import type { Case } from '../schema';
import { parseCase, touchTheDots } from '../testing';
import type { ConsoleEdit } from './codeEdits';
import {
  ADDABLE_KINDS,
  addPanel,
  checkedConsole,
  deletePanel,
  movePanel,
  panelChoices,
  panelName,
  renamePanel,
  resizeArea,
} from './consoleEdits';
import { consoleScope, type CaseConsole } from './format';
import { DEFAULT_CONSOLE } from './layout';
import { signalNamesOf } from './signalNames';

const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
const jointIds = arm.joints.map((j) => j.id);
const plain = (): Case => parseCase(JSON.parse(JSON.stringify(touchTheDots(arm))));

const desk: CaseConsole = {
  input: ['keys'],
  panels: [
    { id: 'cameras', kind: 'camera', signal: 'camera.*' },
    { id: 'brief', kind: 'text', of: 'brief' },
    { id: 'speed', kind: 'plot', title: 'Speed', signals: ['joint.*.position'] },
    { id: 'tries', kind: 'list', of: 'tries' },
  ],
  layout: {
    areas: [{ size: 400, panels: ['cameras'] }, { canvas: true }, { size: 328, panels: ['brief', 'speed', 'tries'] }],
  },
};

const withDesk = (): Case => ({ ...plain(), console: desk });

const saved = (kase: Case, edit: ConsoleEdit): Case => {
  const next = checkedConsole(kase, edit);

  if (typeof next === 'string') throw new Error(next);

  return next;
};

const layoutOf = (kase: Case) => kase.console!.layout.areas;

const choicesFor = (kase: Case, kind: (typeof ADDABLE_KINDS)[number]) => {
  const c = kase.console ?? DEFAULT_CONSOLE;

  return panelChoices(kind, signalNamesOf(consoleScope(c, kase), jointIds, ['camera.wrist']), consoleScope(c, kase));
};

describe('arranging a console by hand', () => {
  it('moves a plot from the right area to the left one, before the panel it lands on', () => {
    const next = saved(withDesk(), movePanel(desk, 'speed', { area: 0, before: 'cameras' }));

    expect(layoutOf(next)).toEqual([
      { size: 400, panels: ['speed', 'cameras'] },
      { canvas: true },
      { size: 328, panels: ['brief', 'tries'] },
    ]);
  });

  it('reorders a panel inside its own area, and an area it empties goes', () => {
    const inside = saved(withDesk(), movePanel(desk, 'tries', { area: 2, before: 'brief' }));

    expect(layoutOf(inside)[2]).toEqual({ size: 328, panels: ['tries', 'brief', 'speed'] });

    const emptied = saved(withDesk(), movePanel(desk, 'cameras', { area: 2 }));

    expect(layoutOf(emptied)).toEqual([
      { canvas: true },
      { size: 328, panels: ['brief', 'speed', 'tries', 'cameras'] },
    ]);
  });

  it('makes a new column at an area’s edge, and refuses a seventh column with its path', () => {
    const next = saved(withDesk(), movePanel(desk, 'brief', { column: 3 }));

    expect(layoutOf(next)).toEqual([
      { size: 400, panels: ['cameras'] },
      { canvas: true },
      { size: 328, panels: ['speed', 'tries'] },
      { size: 320, panels: ['brief'] },
    ]);

    const five = saved(next, movePanel(next.console, 'speed', { column: 0 }));
    const six = saved(five, movePanel(five.console, 'brief', { column: 0 }));

    expect(layoutOf(six)).toEqual([
      { size: 320, panels: ['brief'] },
      { size: 320, panels: ['speed'] },
      { size: 400, panels: ['cameras'] },
      { canvas: true },
      { size: 328, panels: ['tries'] },
    ]);

    const value = choicesFor(six, 'value')[0];
    const two = saved(six, addPanel(six.console, { kind: 'value', choice: value, area: 4 }));
    const full = saved(two, movePanel(two.console, 'value', { column: 5 }));
    const crowded = saved(full, addPanel(full.console, { kind: 'value', choice: value, area: 5 }));

    expect(layoutOf(crowded)).toHaveLength(6);
    expect(checkedConsole(crowded, movePanel(crowded.console, 'value-2', { column: 0 }))).toBe(
      'console.layout.areas holds more than 6 items',
    );
  });

  it('snaps a resized area into 200 to 720 px', () => {
    expect(layoutOf(saved(withDesk(), resizeArea(desk, 0, 912)))[0]).toMatchObject({ size: 720 });
    expect(layoutOf(saved(withDesk(), resizeArea(desk, 2, 64)))[2]).toMatchObject({ size: 200 });
    expect(layoutOf(saved(withDesk(), resizeArea(desk, 2, 333.6)))[2]).toMatchObject({ size: 334 });
    expect(resizeArea(desk, 1, 300).ok).toBe(false);
  });

  it('adds a plot of every joint’s position from the signal names, titled with the signal', () => {
    const kase = withDesk();
    const plot = choicesFor(kase, 'plot').find((c) => c.label === 'joint.*.position')!;
    const next = saved(kase, addPanel(kase.console, { kind: 'plot', choice: plot, area: 0 }));

    expect(next.console!.panels.at(-1)).toEqual({
      id: 'plot',
      kind: 'plot',
      title: 'joint.*.position',
      signals: ['joint.*.position'],
    });
    expect(layoutOf(next)[0]).toEqual({ size: 400, panels: ['cameras', 'plot'] });
  });

  it('offers each kind only the choices it reads, and never code', () => {
    const kase = withDesk();
    const labels = (kind: (typeof ADDABLE_KINDS)[number]) => choicesFor(kase, kind).map((c) => c.label);

    expect(ADDABLE_KINDS).not.toContain('code');
    expect(labels('value')).toContain('joint.arm0.position');
    expect(labels('value')).not.toContain('joint.*.position');
    expect(labels('camera')).toEqual(['camera.*', 'camera.wrist']);
    expect(labels('button')).toContain('Try It');
    expect(labels('list')).toEqual(['Tries', 'Failures']);
    expect(labels('map')).toHaveLength(1);
    ADDABLE_KINDS.forEach((kind) =>
      choicesFor(kase, kind).forEach((choice) =>
        expect(typeof checkedConsole(kase, addPanel(kase.console, { kind, choice }))).not.toBe('string'),
      ),
    );
  });

  it('deletes a panel from the panels and the layout, and renames one', () => {
    const gone = saved(withDesk(), deletePanel(desk, 'cameras'));

    expect(gone.console!.panels.map((p) => p.id)).toEqual(['brief', 'speed', 'tries']);
    expect(layoutOf(gone)).toEqual([{ canvas: true }, { size: 328, panels: ['brief', 'speed', 'tries'] }]);

    const named = saved(withDesk(), renamePanel(desk, 'tries', 'Runs'));

    expect(named.console!.panels.find((p) => p.id === 'tries')).toEqual({
      id: 'tries',
      kind: 'list',
      title: 'Runs',
      of: 'tries',
    });
    expect(deletePanel(desk, 'nope')).toEqual({ ok: false, problem: 'This console has no panel named nope.' });
  });

  it('names a panel the way the screen and Add Panel do, never by its id', () => {
    const reset = { id: 'reset', kind: 'button', action: 'reset' } as const;

    expect([...desk.panels, reset].map(panelName)).toEqual(['Camera', 'Brief', 'Speed', 'Tries', 'Reset']);
  });
});

describe('what a hand edit keeps', () => {
  it('refuses an edit that breaks the format with its path, as the agent’s replies do', () => {
    const kase = withDesk();
    const value = choicesFor(kase, 'value')[0];
    const crowded = Array.from({ length: 9 }).reduce<Case>(
      (k) => saved(k, addPanel(k.console, { kind: 'value', choice: value, area: 2 })),
      kase,
    );

    expect(layoutOf(crowded)[2]).toMatchObject({ size: 328 });
    expect(checkedConsole(crowded, addPanel(crowded.console, { kind: 'value', choice: value, area: 2 }))).toBe(
      'console.layout.areas[2].panels holds more than 12 items',
    );
  });

  it('edits its own copy of the default console when the Case has none', () => {
    const kase = plain();
    const before = structuredClone(DEFAULT_CONSOLE);
    const next = saved(kase, movePanel(kase.console, 'tries', { area: 0 }));

    expect(kase.console).toBeUndefined();
    expect(DEFAULT_CONSOLE).toEqual(before);
    expect(layoutOf(next)[0]).toEqual({ size: 400, panels: ['cameras', 'tries'] });
  });

  it('keeps the edited layout through a saved file and a shared Case', () => {
    const next = saved(withDesk(), movePanel(desk, 'speed', { column: 0 }));
    const reloaded = parseCase(JSON.parse(JSON.stringify(next)));
    const bundle = galleryBundleOf({
      slug: 'arm-desk-1a2b3c',
      title: 'Arm desk',
      robotName: 'Arm',
      parts: arm.parts,
      joints: arm.joints,
      kase: next,
    });

    expect(reloaded.console).toEqual(next.console);
    expect(parseGalleryBundle(JSON.parse(JSON.stringify(bundle))).case.console).toEqual(next.console);
  });
});
