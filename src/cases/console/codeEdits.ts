import type { CanvasOverlay, CaseConsole, ConsoleArea, OverlayAnchor } from './format';
import { DEFAULT_CONSOLE } from './layout';
import type { PanelSpec } from './panelKinds';

export type CodePlace =
  | { side: 'left' | 'right'; size?: number }
  | { overlay: OverlayAnchor; width?: number; height?: number; pointer?: boolean };

export interface CodeWrite {
  panel: string;
  source: string;
  title?: string;
  height?: number;
  place?: CodePlace;
}

export type ConsoleEdit = { ok: true; console: CaseConsole } | { ok: false; problem: string };

const MAX_INPUTS = 4;

export const SIDE_SIZE = 320;

export const copyOf = (c: CaseConsole | undefined): CaseConsole => structuredClone(c ?? DEFAULT_CONSOLE);

export const isCanvas = (a: ConsoleArea): a is Extract<ConsoleArea, { canvas: true }> => 'canvas' in a;

export function withoutPlace(areas: ConsoleArea[], id: string): ConsoleArea[] {
  return areas.flatMap((a): ConsoleArea[] => {
    if (isCanvas(a)) {
      const overlays = (a.overlays ?? []).filter((o) => o.panel !== id);

      return [overlays.length ? { canvas: true, overlays } : { canvas: true }];
    }

    const panels = a.panels.filter((p) => p !== id);

    return panels.length ? [{ ...a, panels }] : [];
  });
}

export function placedOn(areas: ConsoleArea[], id: string, place: CodePlace): ConsoleArea[] {
  const at = areas.findIndex(isCanvas);

  if ('overlay' in place) {
    const canvas = areas[at] as Extract<ConsoleArea, { canvas: true }>;
    const overlay: CanvasOverlay = {
      panel: id,
      anchor: place.overlay,
      ...(place.width === undefined ? {} : { width: place.width }),
      ...(place.height === undefined ? {} : { height: place.height }),
      ...(place.pointer ? { pointer: true } : {}),
    };

    return areas.map((a, i) => (i === at ? { canvas: true, overlays: [...(canvas.overlays ?? []), overlay] } : a));
  }

  const beside = place.side === 'left' ? at - 1 : at + 1;
  const area = areas[beside];

  if (area && !isCanvas(area))
    return areas.map((a, i) => (i === beside ? { size: place.size ?? area.size, panels: [...area.panels, id] } : a));

  const fresh: ConsoleArea = { size: place.size ?? SIDE_SIZE, panels: [id] };

  return place.side === 'left' ? areas.toSpliced(at, 0, fresh) : areas.toSpliced(at + 1, 0, fresh);
}

const isPlaced = (areas: ConsoleArea[], id: string) =>
  areas.some((a) => (isCanvas(a) ? (a.overlays ?? []).some((o) => o.panel === id) : a.panels.includes(id)));

function codeSpec(write: CodeWrite, existing: PanelSpec | undefined): PanelSpec {
  const title = write.title ?? existing?.title;
  const height = write.height ?? (existing?.kind === 'code' ? existing.height : undefined);

  return {
    id: write.panel,
    kind: 'code',
    ...(title === undefined ? {} : { title }),
    source: write.source,
    ...(height === undefined ? {} : { height }),
  };
}

const withCodeInput = (input: string[]) =>
  input.includes('code') || input.length >= MAX_INPUTS ? input : [...input, 'code'];

export function withCodePanel(current: CaseConsole | undefined, write: CodeWrite): ConsoleEdit {
  const next = copyOf(current);
  const existing = next.panels.find((p) => p.id === write.panel);

  if (existing && existing.kind !== 'code')
    return { ok: false, problem: `${write.panel} is a ${existing.kind} panel. Name the code panel something else.` };

  const panel = codeSpec(write, existing);
  const kept = !write.place && isPlaced(next.layout.areas, write.panel);
  const areas = kept
    ? next.layout.areas
    : placedOn(withoutPlace(next.layout.areas, write.panel), write.panel, write.place ?? { side: 'right' });

  return {
    ok: true,
    console: {
      ...next,
      input: withCodeInput(next.input),
      panels: existing ? next.panels.map((p) => (p.id === write.panel ? panel : p)) : [...next.panels, panel],
      layout: { areas },
    },
  };
}

export function withoutCodePanel(current: CaseConsole | undefined, id: string): ConsoleEdit {
  const panel = current?.panels.find((p) => p.id === id);

  if (!current || panel?.kind !== 'code') return { ok: false, problem: `This Case has no code panel named ${id}.` };

  return { ok: true, console: withoutPanel(current, id) };
}

export const withoutPanel = (current: CaseConsole, id: string): CaseConsole => ({
  ...current,
  panels: current.panels.filter((p) => p.id !== id),
  layout: { areas: withoutPlace(current.layout.areas, id) },
});

export const codePanelsOf = (c: CaseConsole | undefined) =>
  (c?.panels ?? []).filter((p): p is Extract<PanelSpec, { kind: 'code' }> => p.kind === 'code');
