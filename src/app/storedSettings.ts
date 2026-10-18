import type { Preferences } from '../SceneWorkspace';
import { LAYOUT } from '../design-system';

export interface PanelWidths {
  left: number;
  right: number;
}

export const DEFAULT_PREFERENCES: Preferences = {
  snapStepMm: 5,
  snapAngleDeg: 15,
  trackpadMode: 'orbit-scroll',
  showGrid: true,
  sculptEnabled: false,
};

export const DEFAULT_PANEL_WIDTHS: PanelWidths = { left: LAYOUT.leftPanelWidth, right: LAYOUT.rightPanelWidth };

function readStored(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function loadPreferences(): Preferences {
  const saved = readStored('preferences');

  if (saved && typeof saved === 'object') return { ...DEFAULT_PREFERENCES, ...saved };

  return DEFAULT_PREFERENCES;
}

function isPanelWidths(value: unknown): value is PanelWidths {
  const widths = value as Partial<PanelWidths> | null;

  return !!widths && typeof widths.left === 'number' && typeof widths.right === 'number';
}

export function loadPanelWidths(): PanelWidths {
  const saved = readStored('panel-widths');

  return isPanelWidths(saved) ? saved : DEFAULT_PANEL_WIDTHS;
}
