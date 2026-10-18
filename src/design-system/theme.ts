import type { CSSProperties } from 'react';

/**
 * Design system tokens & constants.
 * Benchmarked against Figma UI3, the Codex app, Linear and macOS Tahoe Liquid Glass.
 * Mirrors the @theme block in src/index.css.
 */

export const THEME_COLORS = {
  // Neutral surfaces (no blue tint), separated by lightness steps rather than borders:
  // window chrome < canvas card < panel cards
  studioBg: '#121212',
  canvasBg: '#1b1b1b',
  panelBg: '#1f1f1f',
  panelHeader: '#232323',
  panelSurface: '#262626',
  glassSurface: '#262626',

  // Accents & CAD edge lines
  figmaBlue: '#0d99ff',
  figmaBlueHover: '#2ba5ff',
  figmaBlueSubtle: 'rgba(13, 153, 255, 0.16)',
  cutoutRed: '#ef4444',
  cutoutRedSubtle: 'rgba(239, 68, 68, 0.15)',
  successGreen: '#10b981',

  // Agent presence (Claude coral) — cursor, highlights
  agent: '#d97757',

  // Hairlines
  borderSubtle: 'rgba(255, 255, 255, 0.08)',
  borderMedium: 'rgba(255, 255, 255, 0.12)',
  borderStrong: 'rgba(255, 255, 255, 0.18)',

  // Text tiers
  textPrimary: 'rgba(255, 255, 255, 0.92)',
  textSecondary: 'rgba(255, 255, 255, 0.6)',
  textMuted: 'rgba(255, 255, 255, 0.4)',
} as const;

/** Layout constants shared by panels and canvas overlays */
export const LAYOUT = {
  leftPanelWidth: 288,
  rightPanelWidth: 328,
  leftPanelMin: 230,
  leftPanelMax: 480,
  rightPanelMin: 290,
  rightPanelMax: 620,
  /**
   * Window chrome grid (AGENTS.md §2). The title bar is 44px; every control in it (stoplights,
   * toggles, tabs, actions; all 28px tall except the stoplights) centers on y = 22, 8px from
   * the top and 8px above the cards. The view rail runs down the left edge
   * (36px icons at x 8–44, centered under the close button); cards start 8px after it, sit 8px
   * from the other window edges and 8px apart, with 12px corners and 12px content padding.
   * electron/main.mjs places the stoplights from these numbers (trafficLightPosition).
   */
  titleBarHeight: 44,
  titleBarCenter: 22,
  /** Left edge of the cards: rail icons (8 + 36) + 8px */
  railWidth: 52,
  sheetInset: 8,
  panelGap: 8,
  cardRadius: 12,
  /** From a card's outer edge to its content: 1px border + 11px padding */
  cardPadding: 12,
  /** Stoplights: three 14px buttons, 23px apart (measured on macOS 27); the close button centers on x = 26, like the rail */
  lightsX: 19,
  lightsWidth: 60,
} as const;

/** Liquid Glass surface for controls floating over the 3D canvas (see .glass in index.css) */
export const GLASS_PANEL_CLASS = 'glass rounded-2xl';

/** Denser glass for menus, popovers and tooltips */
export const POPOVER_PANEL_CLASS = 'glass-menu rounded-xl p-1';

/** Drag-enabled header strip used at the top of each docked panel */
export const PANEL_DRAG_HEADER_CLASS =
  'h-11 flex items-center justify-between select-none shrink-0';

export const DRAG_REGION = { WebkitAppRegion: 'drag' } as CSSProperties;
export const NO_DRAG_REGION = { WebkitAppRegion: 'no-drag' } as CSSProperties;

/** Claude's brand coral, used for the agent's cursor and presence on the canvas */
export const AGENT_COLOR = THEME_COLORS.agent;
