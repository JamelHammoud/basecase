# Visual system

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 4. Visual System

- **Type (SF Pro via system font):**
  - Body/base: 14px.
  - Inputs, buttons, inspector rows: 13px.
  - Meta and section labels: 12–12.5px.
  - Panel or empty-state titles: 15–20px.
  - Weights 400/500/600 only.
- **Control sizes:**
  - Inputs, segmented controls, menu items: 32px (`h-8`).
  - Small icon buttons: 28px (`xs`). Default: 32px (`sm`).
  - Bottom toolbar buttons: 44px (`lg`) with 22px icons.
- **Radius ladder (concentric):**
  - Inputs and buttons: 8px.
  - Menus and popovers: 14px.
  - Toolbar islands: 16–20px.
  - Composer and toasts: pill.
- **Surfaces (neutral greys, equal R = G = B; never blue-tinted greys like zinc or slate):**
  - `#121212` window chrome (darkest; slightly translucent in Electron), `#1b1b1b` canvas card (also the 3D scene background), `#1f1f1f` sidebar and inspector cards, `#222222` modals and Settings, glass `rgba(32–36, …)`.
  - Separate levels with lightness steps, not borders or shadows. Panel cards have no outline, and card headers have no line under them. The one exception is the canvas card: a near-transparent white ring (`inset 0 0 0 1px white/[0.05]`) drawn over the 3D view, so the scene separates from the chrome.
  - **Dividers inside panels are fine** and give them structure: full-width `white/[0.06]` hairlines between inspector sections (`Section`), above panel footers, between part-page sections, in menus (`MenuDivider`) and in modals.
- **Text tiers:** `white/90` primary, `white/60` secondary, `white/40` hints.
- **Dividers are always full width.** A horizontal hairline runs edge to edge of its container (menu, popover, panel, section, card), never inset by the container's padding.
  - Use `Divider` (or `MenuDivider` in menus). It cancels the container's horizontal padding, which the container publishes as `--pad-x`. `.glass-menu` defaults to 6px; `Section` sets 12px and Settings 24px.
  - A new container that holds dividers sets `--pad-x` to its horizontal padding (e.g. `[--pad-x:8px] p-[var(--pad-x)]`) instead of a plain `p-2`.
  - Borders on a block that already spans the container (panel headers, `Section`) count as full width.
- **Floating surfaces (`.glass`, `.glass-menu` in `index.css`; the names are historical):**
  - Use only for controls floating over the 3D canvas (toolbar, selection bar, toasts, comment cards), the composer's quote card, and menus, popovers and tooltips.
  - **Matte, not glass:** a solid neutral fill (`#262626` floating controls, `#282828` menus) and a soft drop shadow with a 0.5px dark keyline. No translucency, backdrop blur, specular highlight or light outline.
  - Never on the panel cards or the window chrome.
- **Motion:**
  - 150ms for hover and press. Press scales to 0.94–0.97.
  - 180ms for popovers (`animate-pop-in` / `animate-pop-up`).
  - 240ms for panel collapse (width transition).
  - Easing `cubic-bezier(0.2, 0, 0, 1)`. Respect `prefers-reduced-motion`.
- **Previews** (`.preview` in `index.css`; `.preview-sm` for list thumbnails): part and scene thumbnails sit on a soft spotlight fill with 12px corners (8px small) and no outline or outer hover plate; hover brightens the fill and zooms the image. Parts and Library grids: 2 columns, 8px apart, 12px between rows, 12px from the card edge. The part page hero uses it at 14px. Only a state (the current scene's blue ring) draws an edge.
- **Loading** (`.shimmer`, `.skeleton-line` in `index.css`): a placeholder gets the `.shimmer` sweep, never a hand-written gradient. Loading tiles (`LoadingTiles`) are a `.preview` plus title and subtitle bars at the real tile's line heights, so nothing jumps when results arrive.
- **Focus:** a 2px blue `:focus-visible` ring only.
- **Hidden elements never push content.** Anything that shows only on hover, focus or a state (row actions, grips, badges) takes no space while it's hidden: overlay it (`absolute`) instead of reserving room with `opacity-0`. Row actions float over the row's right end on a gradient of the row's own fill (transparent → opaque over about 32px), so text runs the full width and is covered only while they show (the agent queue's rows, `QueuedMessages`). An invisible control also takes no clicks (`pointer-events-none` until shown).
- **Scrollbars never take space.** Native scrollbars are hidden everywhere (`index.css`); `OverlayScrollbars` (mounted once in `main.tsx`) floats a 6px thumb over whatever is scrolling, fades it 900ms after scrolling stops, and lets you drag it. Never give a scroller a gutter or style `::-webkit-scrollbar` with a width. `.no-scrollbar` opts an element out of the thumb. While a thumb is dragged its scroller has `data-scrollbar-drag` (the agent feed uses it to stop following).
- **CSS layers:** custom classes live in `@layer base` / `@layer components` so Tailwind utilities can override them.
