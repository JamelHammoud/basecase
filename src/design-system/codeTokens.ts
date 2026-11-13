import { LAYOUT, THEME_COLORS } from './theme';

export const CODE_PANEL_TOKENS = {
  '--bc-bg': THEME_COLORS.studioBg,
  '--bc-canvas': THEME_COLORS.canvasBg,
  '--bc-panel': THEME_COLORS.panelBg,
  '--bc-raised': THEME_COLORS.panelHeader,
  '--bc-surface': THEME_COLORS.panelSurface,
  '--bc-accent': THEME_COLORS.figmaBlue,
  '--bc-accent-hover': THEME_COLORS.figmaBlueHover,
  '--bc-red': THEME_COLORS.cutoutRed,
  '--bc-green': THEME_COLORS.successGreen,
  '--bc-line': THEME_COLORS.borderSubtle,
  '--bc-ink': THEME_COLORS.textPrimary,
  '--bc-ink-2': THEME_COLORS.textSecondary,
  '--bc-ink-3': THEME_COLORS.textMuted,
  '--bc-font': "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'Segoe UI', Roboto, sans-serif",
  '--bc-mono': "'SF Mono', ui-monospace, Menlo, monospace",
  '--bc-text': '14px',
  '--bc-text-control': '13px',
  '--bc-text-small': '12px',
  '--bc-control': '32px',
  '--bc-radius': `${LAYOUT.cardRadius}px`,
  '--bc-radius-control': '8px',
  '--bc-gap': `${LAYOUT.panelGap}px`,
  '--bc-inset': `${LAYOUT.cardPadding}px`,
} as const;

export const codePanelTokenCss = () =>
  `:root{${Object.entries(CODE_PANEL_TOKENS)
    .map(([name, value]) => `${name}:${value}`)
    .join(';')}}`;
