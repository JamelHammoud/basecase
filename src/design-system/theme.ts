import type { CSSProperties } from 'react';

export const THEME_COLORS = {
  studioBg: '#121212',
  canvasBg: '#1b1b1b',
  panelBg: '#1f1f1f',
  panelHeader: '#232323',
  panelSurface: '#262626',
  glassSurface: '#262626',

  figmaBlue: '#0d99ff',
  figmaBlueHover: '#2ba5ff',
  figmaBlueSubtle: 'rgba(13, 153, 255, 0.16)',
  cutoutRed: '#ef4444',
  cutoutRedSubtle: 'rgba(239, 68, 68, 0.15)',
  successGreen: '#10b981',

  axisX: '#ef4444',
  axisY: '#22c55e',
  axisZ: '#3b82f6',
  gizmoActive: '#ffffff',

  borderSubtle: 'rgba(255, 255, 255, 0.08)',
  borderMedium: 'rgba(255, 255, 255, 0.12)',
  borderStrong: 'rgba(255, 255, 255, 0.18)',

  textPrimary: 'rgba(255, 255, 255, 0.92)',
  textSecondary: 'rgba(255, 255, 255, 0.6)',
  textMuted: 'rgba(255, 255, 255, 0.4)',
} as const;

export const LAYOUT = {
  leftPanelWidth: 288,
  rightPanelWidth: 328,
  leftPanelMin: 230,
  leftPanelMax: 480,
  rightPanelMin: 290,
  rightPanelMax: 620,
  titleBarHeight: 44,
  titleBarCenter: 22,
  railWidth: 52,
  sheetInset: 8,
  panelGap: 8,
  cardRadius: 12,
  cardPadding: 12,
  lightsX: 19,
  lightsWidth: 60,
} as const;

export const GLASS_PANEL_CLASS = 'glass rounded-2xl';

export const POPOVER_PANEL_CLASS = 'glass-menu rounded-xl p-1';

export const PANEL_DRAG_HEADER_CLASS = 'h-11 flex items-center justify-between select-none shrink-0';

export const DRAG_REGION = { WebkitAppRegion: 'drag' } as CSSProperties;
export const NO_DRAG_REGION = { WebkitAppRegion: 'no-drag' } as CSSProperties;

export const AGENT_COLOR = THEME_COLORS.figmaBlue;

export const DESIGNER_COLORS = ['#d9a441', '#3fae96', '#8f7ae6', '#d6679a', '#7fae4a', '#3aa6bf'] as const;

export const designerColor = (slot: number) => DESIGNER_COLORS[slot % DESIGNER_COLORS.length];
