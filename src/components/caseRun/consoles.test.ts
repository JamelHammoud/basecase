import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { cameraViews } from '../../cameras/views';
import { ARC_CONSOLES } from '../../cases/console/fixtures/arcConsoles';
import type { CaseConsole } from '../../cases/console/format';
import { consoleLayout, DEFAULT_CONSOLE } from '../../cases/console/layout';
import { createSignalBus } from '../../cases/console/signalBus';
import { parseCase, touchTheDots } from '../../cases/testing';
import { box } from '../../sim/fixtures/parts';
import { fixtureRobots } from '../../sim/fixtures/robots';
import type { Simulation } from '../../sim/useSimulation';
import type { Cases } from '../../workspace/useCases';
import type { CameraTiles } from '../cameras/useCameraTiles';
import { ModeHeader } from '../../design-system';
import { CaseRunArea } from './CaseRunArea';
import { CodeOverlays } from './code/CodeOverlays';
import type { PanelContext } from './panelContext';

const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
const kase = touchTheDots(arm);
const runnable = (raw: Record<string, unknown>) => {
  const drop = (id: string) => id !== 'operator';
  const areas = (raw.layout as { areas: Array<{ panels?: string[] }> }).areas;

  return {
    ...raw,
    input: ['keys'],
    panels: (raw.panels as Array<{ id: string }>).filter((p) => drop(p.id)),
    layout: { areas: areas.map((a) => (a.panels ? { ...a, panels: a.panels.filter(drop) } : a)) },
  };
};

function context(caseConsole: CaseConsole): PanelContext {
  const bus = createSignalBus(caseConsole.signals);
  const views = cameraViews(arm.parts, []);

  bus.push({
    time: 1,
    running: true,
    joints: arm.joints.map((j, i) => ({ id: j.id, target: i * 10, position: i * 9, effort: 0.1 })),
    robot: { speed: 0.25, x: 0, z: 0 },
    probes: { dot0: 12, dot1: 80, dot2: 200 },
    inputs: { keys: { v: [1, 0, 0] } },
    goal: { passed: false, margin: -1, failed: ['knocked the shelf'] },
    cameras: views.map((v) => v.key),
  });

  return {
    bus,
    signals: caseConsole.signals ?? [],
    scope: { declared: new Set(), probes: new Set(), inputs: new Set(caseConsole.input) },
    inputs: caseConsole.input,
    brief: kase.brief,
    world: { objects: kase.world.objects, place: (p) => p },
    sim: {
      drive: { cls: null },
      model: null,
      worldParts: [box('shelf', [100, 0, -200], [80, 40, 60], 100)],
    } as unknown as Simulation,
    parts: arm.parts,
    joints: arm.joints,
    fire: () => undefined,
    can: () => true,
    studio: {
      cases: {
        active: kase,
        attempt: { phase: 'idle', elapsed: 0, start: async () => undefined, end: () => undefined },
        realTry: { phase: 'idle', elapsed: 0, canStart: false, start: async () => undefined, end: () => undefined },
        mat: { available: false },
        tries: [],
        dataset: { canExport: false, canPublish: false, exporting: false },
      } as unknown as Cases,
      cameras: {
        views,
        tile: (view) => ({
          view,
          large: false,
          renaming: false,
          onRename: () => undefined,
          canvasRef: () => undefined,
          onToggleSize: () => undefined,
          onMenu: () => undefined,
        }),
        menu: null,
        stream: () => () => undefined,
      } satisfies CameraTiles,
      onShowRobots: () => undefined,
    },
  };
}

function render(caseConsole: CaseConsole) {
  const ctx = context(caseConsole);
  const layout = consoleLayout(caseConsole, { desktop: true, studio: true });
  const html = (side: 'before' | 'after') =>
    layout[side]
      .map((area) =>
        renderToStaticMarkup(
          createElement(CaseRunArea, {
            area,
            side,
            ctx,
            header: createElement(ModeHeader, { title: kase.name, onDone: () => undefined }),
          }),
        ),
      )
      .join('');

  return { before: html('before'), after: html('after') };
}

const panelsIn = (html: string) =>
  [...html.matchAll(/data-panel="([^"]+)" data-kind="([^"]+)"/g)].map((m) => `${m[1]}:${m[2]}`);

describe('a running Case renders any console', () => {
  it('draws the default console as cameras, then the canvas, then brief, failures, servos and tries', () => {
    const { before, after } = render(DEFAULT_CONSOLE);

    expect(panelsIn(before)).toEqual(['cameras:camera']);
    expect(panelsIn(after)).toEqual(['brief:text', 'failures:list', 'servos:table', 'tries:list']);
    expect(before.match(/data-testid="camera-tile"/g)).toHaveLength(views().length);
    expect(after).toContain('knocked the shelf');
    expect(after).toContain('Try It');
    expect(after).toContain('Done');
  });

  it('draws five consoles from arc #184, each with its own areas and panels', () => {
    const drawn = ARC_CONSOLES.map(({ name, console }) => {
      const parsed = parseCase({ ...JSON.parse(JSON.stringify(kase)), console: runnable(console) }).console!;
      const { before, after } = render(parsed);

      return { name, before: panelsIn(before), after: panelsIn(after), html: before + after };
    });

    expect(drawn.map(({ name, before, after }) => [name, before, after])).toEqual([
      ['G1 arm teleop', ['robot-eye:camera'], ['joints:table', 'arms:plot']],
      ['Rover', ['front:camera'], ['map:map', 'speed:value']],
      ['Sorting cell', [], ['count:value', 'failures:list', 'go:button', 'overhead:camera']],
      ['Block game', ['clock:value', 'score:value'], ['go:button', 'reset:button', 'tries:list']],
      ['MIDI hexapod', [], ['timeline:plot', 'eye:camera']],
    ]);

    const [g1, rover, sorting, game, midi] = drawn.map((d) => d.html);

    expect(g1).toContain(`data-lines="${arm.joints.length}"`);
    expect(g1.match(/data-joint=/g)).toHaveLength(arm.joints.length);
    expect(rover).toContain('data-objects="1"');
    expect(rover).toContain('data-testid="map-robot"');
    expect(rover).toContain('0.25');
    expect(sorting).toMatch(/data-signal="sorted">1</);
    expect(sorting).toContain('knocked the shelf');
    expect(game).toMatch(/data-signal="clock">60.0 s</);
    expect(game).toMatch(/data-signal="score">60</);
    expect(game).toContain('Reset');
    expect(midi).toContain(`data-lines="${arm.joints.length}"`);
  });
});

describe('a running Case renders code panels', () => {
  const source = '<canvas></canvas><script>basecase.drive({ v: [0, 0, 0] })</script>';
  const coded = parseCase({
    ...JSON.parse(JSON.stringify(kase)),
    console: {
      input: ['code', 'keys'],
      panels: [
        { id: 'stick', kind: 'code', title: 'Stick', height: 240, source },
        { id: 'hud', kind: 'code', source },
      ],
      layout: {
        areas: [
          { canvas: true, overlays: [{ panel: 'hud', anchor: 'bottom', height: 64 }] },
          { size: 320, panels: ['stick'] },
        ],
      },
    },
  }).console!;

  it('as a sandboxed frame in its area, and as an overlay that lets clicks through', () => {
    const { after } = render(coded);
    const overlays = renderToStaticMarkup(
      createElement(CodeOverlays, {
        overlays: consoleLayout(coded, { desktop: true, studio: true }).overlays,
        ctx: context(coded),
      }),
    );

    expect(panelsIn(after)).toEqual(['stick:code']);
    expect(after).toContain('sandbox="allow-scripts"');
    expect(after).not.toContain('allow-same-origin');
    expect(after).toContain('height:240px');
    expect(after).toContain('pointer-events:auto');
    expect(overlays).toContain('data-panel="hud"');
    expect(overlays).toMatch(/style="bottom:12px;left:12px;right:12px;height:64px"/);
    expect(overlays).toContain('pointer-events:none');
  });
});

function views() {
  return cameraViews(arm.parts, []);
}
