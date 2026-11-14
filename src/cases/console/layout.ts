import { STUDIO_INPUTS } from '../../sim/inputSources';
import type { CanvasOverlay, CaseConsole } from './format';
import { panelShows, type PanelOf, type PanelSpec, type PanelSurface } from './panelKinds';

export const DEFAULT_CONSOLE: CaseConsole = {
  input: STUDIO_INPUTS,
  panels: [
    { id: 'cameras', kind: 'camera', signal: 'camera.*' },
    { id: 'brief', kind: 'text', of: 'brief' },
    { id: 'failures', kind: 'list', of: 'failures' },
    { id: 'servos', kind: 'table', of: 'servos' },
    { id: 'tries', kind: 'list', of: 'tries' },
  ],
  layout: {
    areas: [
      { size: 400, panels: ['cameras'] },
      { canvas: true },
      { size: 328, panels: ['brief', 'failures', 'servos', 'tries'] },
    ],
  },
};

export interface PlacedArea {
  key: string;
  at: number;
  size: number;
  panels: PanelSpec[];
  last: boolean;
}

export interface PlacedOverlay extends CanvasOverlay {
  spec: PanelOf<'code'>;
}

export interface ConsoleLayout {
  before: PlacedArea[];
  after: PlacedArea[];
  overlays: PlacedOverlay[];
}

export function consoleLayout(caseConsole: CaseConsole | undefined, surface: PanelSurface): ConsoleLayout {
  const { panels, layout } = caseConsole ?? DEFAULT_CONSOLE;
  const byId = new Map(panels.map((p) => [p.id, p]));
  const canvasAt = layout.areas.findIndex((a) => 'canvas' in a);
  const canvas = layout.areas[canvasAt];
  const overlays = ('overlays' in canvas ? (canvas.overlays ?? []) : []).map((o) => ({
    ...o,
    spec: byId.get(o.panel) as PanelOf<'code'>,
  }));
  const placed = layout.areas.flatMap((area, i) => {
    if (!('panels' in area)) return [];

    const shown = area.panels.map((id) => byId.get(id)!).filter((p) => panelShows(p, surface));

    return shown.length ? [{ key: `area-${i}`, at: i, size: area.size, panels: shown }] : [];
  });
  const lastKey = placed.at(-1)?.key;
  const area = ({ key, at, size, panels: list }: (typeof placed)[number]) => ({
    key,
    at,
    size,
    panels: list,
    last: key === lastKey,
  });

  return {
    before: placed.filter((a) => a.at < canvasAt).map(area),
    after: placed.filter((a) => a.at > canvasAt).map(area),
    overlays,
  };
}
