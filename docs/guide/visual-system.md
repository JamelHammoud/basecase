# Visual system

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 4. Visual System

- **Type (SF Pro via system font):**
  - Body/base: 14px.
  - Inputs, buttons, inspector rows: 13px.
  - Meta and section labels: 12–12.5px.
  - Panel or empty-state titles: 15–20px.
  - Weights 400/500/600 only.
- **Control sizes** (minimums, checked on every view by the Stage 7 rehearsal, §0k):
  - Inputs, selects, segmented controls, tabs, menu items and any button with text: at least 32px. `Button` is 32px at `xs` and `sm`, 36px at `md`.
  - Icon-only buttons: at least 28px (`IconButton` `xs`); 32px `sm` is the default, 36px `md`, 44px `lg` (the bottom toolbar, with 22px icons). A small visual (a switch track, a tab's ×) sits inside a 28px hit box.
  - Write control heights in px (`h-[32px]`), never rem steps: the root font size is 14px, so Tailwind's `h-8` is only 28px and `h-7` 24.5px. `controlHeights.test.ts` fails `h-7` to `h-9` (with `min-`, `max-` or `size-`) anywhere in `src/`, since that's where a rem step hides a control under 32px. Clickable rows count as controls: Layers, poses, policies, joints, Peak torque and the agent's subagent rows are 32px. Comment pins are 32px too, which their 16px corners were drawn for.
- **Radius ladder (concentric):**
  - Inputs and buttons: 8px.
  - Menus and popovers: 14px.
  - Toolbar islands: 16–20px.
  - Composer and toasts: pill.
- **Surfaces (neutral greys, equal R = G = B; never blue-tinted greys like zinc or slate):** `neutralGreys.test.ts` fails any tinted grey in a Tailwind class (`bg-[#2a2a2f]`) or a stylesheet. Part colours are scene data and aren't held to it.
  - `#121212` window chrome (darkest; slightly translucent in Electron), `#1b1b1b` canvas card (also the 3D scene background), `#1f1f1f` sidebar and inspector cards, `#222222` modals and Settings (`.sheet`), glass `rgba(32–36, …)`.
  - Separate levels with lightness steps, not borders or shadows. Panel cards have no outline, and card headers have no line under them. The one exception is the canvas card: a near-transparent white ring (`inset 0 0 0 1px white/[0.05]`) drawn over the 3D view, so the scene separates from the chrome.
  - **Dividers inside panels are fine** and give them structure: full-width `white/[0.06]` hairlines between inspector sections (`Section`), above panel footers, between part-page sections, in menus (`MenuDivider`) and in modals.
- **Text tiers:** `white/90` primary, `white/60` secondary, `white/50` hints (meta lines, units, section labels, placeholders).
  - Hints are `white/50`, not lower, for WCAG AA: on the lightest panel surface (`#282828`), `white/40` is about 3.7:1 and `white/45` about 4.2:1, both under 4.5:1, while `white/50` is about 4.8:1. Nothing that reads as text goes below `white/50` (tokens `--color-ink-3` and `THEME_COLORS.textMuted` match). Disabled controls are exempt, and icons and dividers may stay fainter.
- **Text on the accent** sits on `figma-blue-fill` (`#0b78cc`, hover `figma-blue-fill-hover` `#0a6fbd`): the accent's hue, deep enough for white text at 4.5:1 (white on `#0d99ff` is 3:1). Primary buttons, the highlighted menu item, selected plate and comment numbers use it; icons, rings, progress bars and selection tints keep `#0d99ff`.
- **Dividers are always full width.** A horizontal hairline runs edge to edge of its container (menu, popover, panel, section, card), never inset by the container's padding.
  - Use `Divider` (or `MenuDivider` in menus). It cancels the container's horizontal padding, which the container publishes as `--pad-x`. `.glass-menu` defaults to 6px; `Section` sets 12px and Settings 24px.
  - A new container that holds dividers sets `--pad-x` to its horizontal padding (e.g. `[--pad-x:8px] p-[var(--pad-x)]`) instead of a plain `p-2`.
  - Borders on a block that already spans the container (panel headers, `Section`) count as full width.
- **Floating surfaces (`.glass`, `.glass-menu` and `.sheet` in `index.css`; the names are historical):**
  - Use only for controls floating over the 3D canvas (toolbar, toasts, comment cards, the Cameras strip) or over a list (the chat's scroll-to-bottom button), the composer's quote card, menus, popovers and tooltips, and sheets (`Modal`, Settings).
  - **Matte, not glass:** a solid neutral fill (`#262626` floating controls, `#282828` menus, `#222222` sheets) and a soft drop shadow with a 0.5px dark keyline. No translucency, backdrop blur, specular highlight or light outline. A surface takes its class rather than hand-rolling the fill and shadow.
  - Never on the panel cards or the window chrome.
- **Motion:**
  - 150ms for hover and press, and for what a press flips at once: a switch, a segmented control, a disclosure chevron, a tile's zoom. Press scales to 0.94–0.97.
  - 180ms for popovers (`animate-pop-in` / `animate-pop-up`).
  - 240ms for panel collapse (width transition).
  - Easing `cubic-bezier(0.2, 0, 0, 1)`. Respect `prefers-reduced-motion`.
- **Previews** (`.preview` in `index.css`; `.preview-sm` for list thumbnails): part and scene thumbnails sit on a soft spotlight fill with 12px corners (8px small) and no outline or outer hover plate; hover brightens the fill, and a tile you click (Parts, its robots and objects, Library, hardware types) zooms its image 6% (`PreviewImage` `zoom`). Parts and Library grids: 2 columns, 8px apart, 12px between rows, 12px from the card edge. The part page hero uses it at 14px. Only a state (the current scene's blue ring) draws an edge. In the app's panels the image inside is a `PreviewImage`: it shimmers while the thumbnail renders and leaves the frame empty when there's none (a failed render or load, a scene with no parts), never a “No preview” caption, a placeholder icon or a shimmer that never ends.
- **Loading** (`.shimmer`, `.skeleton-line` in `index.css`): a placeholder gets the `.shimmer` sweep, never a hand-written gradient. Loading tiles (`LoadingTiles`) are a `.preview` plus title and subtitle bars at the real tile's line heights, so nothing jumps when results arrive.
  - Something running gets `Spinner`, never a spinning glyph: the agent, a Check, an upload, a progress toast, Build Along opening. Size and colour come from where it sits; its shape and speed don't change.
  - How far something has got, or how much of a whole is used, is a `ProgressBar`, never a hand-drawn bar: one height, track and fill everywhere, from training to the budget.
- **Focus:** a 2px blue `:focus-visible` ring only.
- **Hidden elements never push content.** Anything that shows only on hover, focus or a state (row actions, grips, badges) takes no space while it's hidden: overlay it (`absolute`) instead of reserving room with `opacity-0`. Row actions float over the row's right end on a gradient of the row's own fill (transparent → opaque over about 32px), so text runs the full width and is covered only while they show (the agent queue's rows, `QueuedMessages`). Where the row has no opaque fill, like a scene tab on the title bar, the text itself fades under the control with a `mask-image` instead (`SceneTab`). An invisible control also takes no clicks (`pointer-events-none` until shown).
- **Scrollbars never take space.** Native scrollbars are hidden everywhere (`index.css`); `OverlayScrollbars` (mounted once in `main.tsx`) floats a 6px thumb over whatever is scrolling, fades it 900ms after scrolling stops, and lets you drag it. Never give a scroller a gutter or style `::-webkit-scrollbar` with a width. `.no-scrollbar` opts an element out of the thumb. While a thumb is dragged its scroller has `data-scrollbar-drag` (the agent feed uses it to stop following).
- **CSS layers:** custom classes live in `@layer base` / `@layer components` so Tailwind utilities can override them.
