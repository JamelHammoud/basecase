# AGENTS.md — Design, Copy, and UI/UX Guidelines

This document defines the design principles, UI/UX conventions, copy rules, and architectural standards for **Basecase**, a 3D robotics CAD studio with an AI agent. Any agent modifying or extending this codebase must consult, follow, and maintain these guidelines.

**Writing any user-facing text** (labels, buttons, headers, captions, empty states, toasts, errors, tooltips, agent-facing UI)? Follow §3, and run its checklist (§3d) on every string you add or change.

References studied for this system: Figma UI3, the OpenAI Codex / ChatGPT desktop apps, mobbin.com, Linear, Raycast, macOS Tahoe Liquid Glass (WWDC25 “Meet Liquid Glass”), Vercel Geist, Things 3; copy guides from Apple HIG, Mailchimp, Material, Shopify Polaris, Atlassian, Microsoft, GOV.UK, Stripe, Linear and 37signals.

---

## 1. Core Mission & Design Ideals

- **The whole robotics loop, in one app.** Basecase covers six stages: **Design → Engineer → Simulate → Train → Build → Operate**.
  - A failure in stages 2–4 loops back to Design. Real-robot data from Operate loops back to calibrate the sim and retrain.
  - Design and Engineer ship today; **Simulate and Train (MuJoCo, §8d) are the current work**; Build is partial; Operate comes later.
  - Plan, milestones and status: [docs/Robotics loop.md](docs/Robotics%20loop.md). Keep its status column current as milestones land.
- **CAD for non-CAD users.** Approachable and visual, without losing precision: millimeter dimensions, CSG booleans, mounting holes, STL export.
- **MacBook + trackpad first.** Two-finger orbit/pan, pinch zoom, Space-drag pan, right-click (two-finger click) menus.
- **Simple, then powerful.** Show what applies now; reveal the rest through menus, ⌘K, right-click and disclosure sections.
- **Comfortable, not compact.** The user explicitly dislikes tiny, dense UI. Never go below the type and control sizes in §4.
- **Dark studio aesthetic** (references: Claude, Codex, Mobbin, Crew). Neutral greys with no blue tint, surfaces separated by lightness steps instead of borders, one accent (Figma blue `#0d99ff`), red only for cutouts and destructive actions.

---

## 2. Window Framing & macOS Integration

- **Structure (like the ChatGPT desktop app):** an outer **window chrome** (`.window-chrome`, `#121212`, darker than every card) holds a 44px title bar, a **view rail** down the left edge, and three rounded **cards**: sidebar, canvas, inspector. Cards have 12px corners and **no border**: they read as surfaces by lightness alone.
- **Title bar, left to right:** stoplights · sidebar toggle (`PanelLeft`, ⌘B) · scene tabs (§5a) · the scene's Undo · Redo, Export and inspector toggle (`PanelRight`, ⌘I). The toggles and Export never move; collapsing a panel just closes its card and its gap.
  - Nothing names or creates the scene outside the tabs: no scene-name header and no New Scene button in the sidebar.
  - The one top bar is this title bar. **Never** render fake stoplights or a second bar that pushes the cards down.
- **View rail** (`nav` "Sidebar views" in `SceneWorkspace`): the sidebar's views as 36px icon buttons on the chrome, under the close button: Parts (the default view), Robots, Layers, Library; Settings (⌘,) at the bottom. Tooltips open to the right. The open view has a soft fill and its icon turns filled (outline while idle): Parts is a hex nut, Robots a round robot face looking straight ahead (solid eyes; the filled state's holes are cut a little larger so they look the same size), Library a bookmark (`src/design-system/icons.tsx`). Clicking another view opens the sidebar on it; clicking the open view collapses the sidebar (like an activity bar). The rail stays when the sidebar is collapsed.
- **Card headers:** each side card starts with a 44px header row (no hairline under it) whose content centers on y = 66, in line with the first rail icon. The inspector's header holds 28px controls with 8px padding, an even 8px on every side. The sidebar's header names the open view (15px semibold); the inspector's holds `PanelTabs` (Inspect · Pose · Simulate · Build · Agent; Pose and Simulate only with joints; Agent shows the coral spinner while the agent works) and nothing else.
- **The grid** (`LAYOUT` in `theme.ts`; keep these numbers in sync with `trafficLightPosition` in `electron/main.mjs`):
  - **One centerline, y = 22.** Stoplights (14px buttons, 23px apart, measured on macOS 27) are at `trafficLightPosition: { x: 19, y: 15 }`, so they span x 19–79 and y 15–29. Toggles, actions, tabs and + are all 28px tall at `top-[8px]`: 8px from the window top and 8px above the cards (y = 44).
  - **The rail column:** icons span x 8–44 and center on x = 26, under the close button. They're 4px apart; the first centers on y = 66 and Settings ends 12px above the window bottom.
  - **8px everywhere outside the cards:** cards start 8px after the rail (x = 52), sit 8px from the window's right and bottom edges and 8px apart; the sidebar toggle is 8px after the stoplights (x = 87); tabs start 8px after the toggle (x = 123) and end 8px before the title bar actions.
  - **12px from a card's edge to its content** (`px-[12px]`; lists 8px, since rows pad themselves). The title bar actions' right edge (width − 20) lines up with the inspector's content.
  - The root font size is 14px, so `rem`-based Tailwind sizes (`h-10` = 35px, `px-3` = 10.5px, `gap-1` = 3.5px) are off-grid. Use px values for chrome, card padding and anything aligned to the stoplights.
  - Main-process changes (like `trafficLightPosition`) need an Electron restart; the renderer hot-reloads.
- **Window dragging:** the title bar uses `DRAG_REGION`. Every interactive child uses `NO_DRAG_REGION` (both exported from `src/design-system/theme.ts`).
- **Vibrancy:** the Electron window uses `vibrancy: 'sidebar'` with a transparent background. `main.tsx` adds `html.is-electron`, and `.window-chrome` turns translucent only in Electron, so the title bar and gaps show the desktop like a macOS sidebar. The cards stay opaque. In full screen there's no desktop behind the window, so `main.tsx` adds `html.is-fullscreen` (from the `window:fullscreen` events) and the chrome turns solid `#121212`.
- **Window size:** minimum 1240 × 720.
- **App name: Basecase.** `app.setName('Basecase')` in `electron/main.mjs`, which also moves the old `Application Support/Robotics 3D Studio` folder (localStorage) to `Basecase` once. In dev, macOS names the app after its bundle (menu bar, Dock, ⌘Tab, Force Quit), so `npm run electron[:dev]` launches through `tools/electron-dev.mjs`: it keeps an APFS clone of Electron.app as `node_modules/.cache/basecase-electron/Basecase.app` with its own executable, bundle id (`app.basecase.dev`) and app icon, rebuilt when Electron's version or the compiled icon changes. Because the executable isn't named Electron, `app.isPackaged` is true in dev; check `process.defaultApp` for dev-only behavior.
- **App icon:** a white squircle ring (superellipse n = 4, 600 of 1024, opening 0.446 of the ring) on a dark grey glass background made from the app's own surfaces (`#121212` chrome up to a lifted `#3c3c3d` highlight). The source is the Icon Composer file `build/icon/Basecase.icon`: the ring (`Assets/ring.svg`) is a glass layer, so macOS adds the specular edge, frosting and shadow; the mesh (`Assets/background.png`) is a flat layer under it. The mesh comes from `build/icon/mesh.html` (solid colour fields + a conic fan + directional veils, blurred as a share of the tile, with grain), rendered by `node tools/icon-mesh.mjs [seed] [out] [palette]` (grey seed 7 ships; a blue palette is kept as an alternative). `npm run icon` compiles `build/icon/compiled/Assets.car` (Liquid Glass) and `Basecase.icns` (fallback) with Xcode's actool; `tools/electron-dev.mjs` installs both in the dev bundle. `build/icon/basecase-1024.png` is macOS's own rendering, for docs. Restart the app to see a new icon.
- **Favicon** (`public/favicon.svg`): the ring alone, no background, black in light mode and white in dark (`prefers-color-scheme` inside the SVG).
- **Native menu bar** (`electron/app-menu.mjs`): App (Settings… ⌘,), File (New Scene ⌘T, Reopen Closed Scene ⇧⌘T, …, Import SVG…, Import Robot…, Import BVH…, Close Scene ⌘W, Close Window ⇧⌘W), Edit (…, Find Parts… ⌘F), View (Camera ▸, Two-Finger Scroll ▸, grid, reference images, panels), Window (Show Previous / Next Scene ⇧⌘[ / ⇧⌘], then every open scene with ⌘1–⌘9), Help (Keyboard Shortcuts ?).
  - Items send `menu:command` ids to the renderer: tab commands (`new-scene`, `close-tab`, `reopen-tab`, `next-tab`, `prev-tab`, `tab:<id>`) run in `App.tsx`, the rest in the scene in front (`runMenuCommand` in `SceneWorkspace.tsx`). Both report checkmarks and enabled state back with `menu:state` (partial updates merge).
  - Shortcuts the renderer already handles are display-only (`registerAccelerator: false`), so keys never run twice or fire while typing. Undo, Redo and Select All stay registered so text fields keep native editing; the renderer ignores a menu repeat of a key it just handled.
  - Every new app-level command gets a menu item when it fits one of these menus.

---

## 3. Copy & Labeling Rules

Every word in the UI is product copy. Write it to the standard below, and check it against the checklist (§3d) before shipping. These rules distil Apple's HIG “Writing”, the Microsoft Writing Style Guide, NN/g's error-message and empty-state guidelines, Mailchimp's Voice & Tone guide, and Monzo's tone of voice. They're tested against product copy those sources and the wider industry celebrate (§3e).

### 3a. Principles

1. **Every word earns its place.** Read it aloud, then cut. “Check each word to be sure it needs to be there. If you can use fewer words, do so” (Apple). “Bigger ideas, fewer words” (Microsoft): “Ready to buy? Contact us.”
2. **Never say what the UI already shows.** If a number, total, icon, state or the layout already tells the person something, the text must not repeat it. `$0` already says there's nothing to buy, so a “Nothing to buy yet” caption is noise. Show no caption at all rather than a redundant one.
3. **Name things for what they are, not for what they aren't.** Use “Supplies”, not “Not in the model”, and “No chats”, not “No past chats yet”. Labels are nouns for things and verbs for actions.
4. **Lead with what matters to the person** (Monzo: “lead with impact”; Microsoft: “get to the point fast”). Front-load the keyword or the action: “Recheck 2 prices before ordering”, not “2 prices are over 60 days old. Recheck…”.
5. **Make the next step obvious.** When text points at work to do, start with the verb and make it clickable: “Replace 2 stand-ins with real parts”, “Find a source for 1 part (CNC)”, “Fix 3 parts before printing”.
6. **Plain and specific.** Use everyday words, active voice and contractions (it's, they're); no jargon the person didn't bring. Use exact numbers and names, not vague ones (“3 to price”, not “some items”).
7. **Calm and kind, never cute.** No “Oops”, “Uh-oh”, exclamation marks, or jokes in errors or anything that blocks work. Don't blame the person. Apologize only when the app is at fault, and only once.
8. **Consistent.** The same word for the same thing everywhere, and the same pattern for the same kind of message (§3b).

### 3b. Rules by element

1. **Casing:**
   - Title Case for buttons and menu items (macOS): “Export STL”, “Save to Library”, “Zoom to Selection”, “Add Price…”.
   - Sentence case for tooltips, section titles, headers, helper text, placeholders, toasts and errors.
2. **Buttons are verbs**, 1–3 words, saying what happens: Add, Save, Apply, Done, Export STL, Add Price…, Browse Parts. Never “OK”, “Submit”, “Yes”, “Continue” where a real verb exists, or “Click here”.
3. **Export:** one Export button (Title Case, never all caps) in the title bar, between Redo and the inspector toggle, whether or not the inspector is open. It opens a menu of formats: PNG Image, STL Mesh and Copy as Markdown, with labels only (no descriptions). Saving the scene is **Save Scene** (⌘S), in the File menu, ⌘K and the Library header.
4. **Ellipsis only when more input follows:** “Import SVG…”, “From Image…”, “Add Part…”, “Add Price…”.
5. **Tooltips = name + shortcut**, with no period: `Move  V`, `Undo  ⌘Z`. Add a short sentence only for non-obvious tools.
6. **Section titles and headers** name the content: “Budget”, “Parts to buy”, “Supplies”, “Printed parts”. No questions, instructions or negations.
7. **Empty states:**
   - If something on screen already shows the emptiness (a $0 total, a 0 count, a lone section header, settings with nothing under them), show **no** empty text.
   - Otherwise use a short noun phrase, plus one action when there's a useful next step: “No parts” + [Browse Parts], “No saved scenes”, “No chats”.
   - Never add a description that restates the title (“No parts yet” / “Parts you add appear here.”). Never use “yet”, “nothing to … yet”, “will appear here” or “show up here”.
   - Inspector sections never explain how to use a feature (“Pin notes to any spot in 3D. Press M…”). An empty section shows just its title and header action; the tooltip carries the shortcut.
8. **Captions under numbers** add information the number lacks (“2 of 5 prices checked”, “$40 left · 3 to price”), or they don't exist.
9. **Errors and warnings:** say what happened, then how to fix it, next to the problem. Prefer the fix to the fault (Apple: “Choose a password with at least 8 characters”, not “That password is too short”). Example: “Nothing to subtract. Overlap a Cutout or Shift-click a part.” No error codes in the UI and no robotic “Invalid X”.
10. **Notices that ask for work** start with the verb and select or open the things they're about: “Replace 2 stand-ins with real parts”.
11. **Placeholders show an example**, never instructions: “e.g. 4× M3 holes, 0.2 mm clearance”.
    - Search fields are the exception: they name what they search, “Search parts”.
12. **Toasts confirm in past tense** and name the thing, with Undo for destructive or bulk actions: “Deleted Cube · Undo”, “Saved Robot Arm”, “Exported STL”. Not a bare “Saved” or “Done”, and never “successfully”.
13. **Footnotes and fine print:** one line, front-loaded, fragments are fine: “Estimate for a Bambu P1S: 2 walls, 4 top and bottom layers, 20% infill, best flat orientation. Slice to confirm.”
14. **Numbers:**
    - Tabular figures, units in a muted suffix (`mm`, `°`, `%`).
    - Use `×` for sizes: `40 × 36 × 20`.
    - Use numerals, not words (“3 parts”), and pluralize correctly (“1 part”, “2 parts”).
15. **Same word everywhere for the same thing:**
    - Parts are added, models are inserted, scenes are opened (in a tab) and closed, comments are posted, prices are added and checked.
    - Part types are **Solid / Cutout / Guide**.
16. **Icon-first.** `lucide-react` icons with custom tooltips (the `Tooltip` primitive), never native `title` on buttons.
    - When lucide has nothing that reads clearly, draw a custom icon with the `icon-design` skill (`.claude/skills/icon-design/SKILL.md`): 24 grid, 2px round strokes, an outline/filled pair for anything that toggles, previewed beside its neighbours before shipping.
17. **No status dots** unless they report an error or a live background process. The agent panel shows connection state only when disconnected.

### 3c. Words and patterns to avoid

| Avoid | Why | Use instead |
|---|---|---|
| “yet” (“No parts yet”) | Filler; the person knows they can add more | “No parts” |
| “Nothing to … yet” | Usually restates a visible 0 or $0 | No text, or a noun phrase |
| “… will appear here”, “show up here” | Explains the obvious | Omit, or name the action |
| “Not in …”, “Non-…”, “Un…” as a label | Defines by absence | Name the thing (“Supplies”) |
| “Please”, “simply”, “just”, “easily”, “successfully” | Padding or condescending | Cut |
| “We”, “Your …” | Unclear who “we” is; “Your Favorites” = “Favorites” (Apple) | Omit the pronoun |
| “Oops”, “Uh-oh”, “!” | Insincere, especially in errors (Apple, NN/g) | State the problem and fix |
| “Invalid …”, “Error: …”, codes | Robotic, not actionable | What to do instead |
| “Click here”, “Learn more” alone | Doesn't say where it goes | Describe the destination |
| “AI brief”, “AI …” as a feature name | Names our plumbing, not what the person gets | Name the result: “Save Scene”, “Copy as Markdown” |
| Quotes around placeholder examples | Visual noise | “e.g. Open Duck Mini, about 40 cm tall” |
| “You can …”, “There is/are …” | Weak openers (Microsoft) | Start with the verb |

### 3d. Checklist before shipping any UI text

- [ ] Read it aloud. Could it lose a word, or a whole line?
- [ ] Does anything on screen already say this (a number, an icon, a state, the section title)? If so, delete it.
- [ ] Does it name a thing, or describe its absence? Name the thing.
- [ ] If it asks for work, does it start with the verb, and does clicking it help do the work?
- [ ] Is the most important word first?
- [ ] Same word as everywhere else for this thing? Right casing for this element?
- [ ] No banned words (§3c)?

### 3e. Reference examples

Celebrated product copy and what it teaches:

- **Microsoft:** “Ready to buy? Contact us.” replaced a 16-word sentence; “Invalid ID” became “You need an ID that looks like this: someone@example.com”. Cut to the decision, and replace a fault with an instruction.
- **Datadog** (cited by NN/g): an empty favorites list says “Star your favorites to list them here”. An empty state teaches the one action that fills it.
- **Mailchimp:** password rules that grey out one by one as you meet them, instead of an error after you submit. Prevent the error, and give feedback in place.
- **Monzo:** “We've blocked your card and ordered you a new one” instead of “Your card was blocked and a replacement has been requested”. Active voice, impact first, the person's outcome in plain words.
- **Slack:** Slackbot says plainly that it's “only a bot”, and empty channels tell you you're caught up. Honest framing and a calm tone.

Before → after in this app:

| Before | After | Rule |
|---|---|---|
| $0 + “Nothing to buy yet” | $0 (no caption) | Don't repeat what the number shows |
| “Not in the model” | “Supplies” | Name the thing, not its absence |
| “No parts yet” / “Parts you add appear here.” | “No parts” + [Browse Parts] | No “yet”; no restating description |
| “$40 left before unchecked prices” | “$40 left · 3 to price” | Specific numbers, plain words |
| “2 parts need changes to print well” | “Fix 2 parts before printing” | Verb first for work to do |
| “3 estimated stand-ins to replace with real parts” | “Replace 3 stand-ins with real parts” | Verb first |
| “Check…” | “Add Price…” | Button says what happens |
| “Saved” | “Saved Robot Arm” (the scene's name) | Toasts name the thing |
| “Save AI Brief”, “Copy AI Brief” | “Save Scene”, “Copy as Markdown” | Name the action, not an internal artifact |
| “What are we building?” | “What should Claude build?” | Say who “we” is |
| “Describe a part, or paste a photo” (placeholder) | “e.g. Desk lamp arm with three servo joints” (never a copy of a suggestion shown above it) | Placeholders show an example |
| “Save a part, import an SVG, or ask the agent to make one.” | “No models” | Empty states are a noun phrase |
| “No matches” + “Nothing found for “servo”.” | “No matches for “servo”” | Don't restate the title |
| “Save and Sync” (File menu, ⌘S) | “Save Scene” | One name per action everywhere |
| “Saved with today's date. Prices change, so the check goes stale after 60 days.” | “Saved with today's date. Recheck after 60 days.” | Cut the explanation |

Sources: [Apple HIG: Writing](https://developer.apple.com/design/human-interface-guidelines/writing), [Microsoft: Top 10 tips for style and voice](https://learn.microsoft.com/en-us/style-guide/top-10-tips-style-voice), [NN/g: Error-message guidelines](https://www.nngroup.com/articles/error-message-guidelines/), [NN/g: Designing empty states](https://www.nngroup.com/articles/empty-state-interface-design/), [Mailchimp Voice & Tone](https://styleguide.mailchimp.com/voice-and-tone/), [Monzo tone of voice](https://monzo.com/tone-of-voice), [Econsultancy: 15 microcopy examples](https://econsultancy.com/15-marvellous-microcopy-examples-and-how-they-improve-ux/).

---

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
  - Use only for controls floating over the 3D canvas (toolbar, selection bar, toasts, comment cards) and for menus, popovers and tooltips.
  - **Matte, not glass:** a solid neutral fill (`#262626` floating controls, `#282828` menus) and a soft drop shadow with a 0.5px dark keyline. No translucency, backdrop blur, specular highlight or light outline.
  - Never on the panel cards or the window chrome.
- **Motion:**
  - 150ms for hover and press. Press scales to 0.94–0.97.
  - 180ms for popovers (`animate-pop-in` / `animate-pop-up`).
  - 240ms for panel collapse (width transition).
  - Easing `cubic-bezier(0.2, 0, 0, 1)`. Respect `prefers-reduced-motion`.
- **Previews** (`.preview` in `index.css`; `.preview-sm` for list thumbnails): part and scene thumbnails sit on a soft spotlight fill with 12px corners (8px small) and no outline or outer hover plate; hover brightens the fill and zooms the image. Parts and Library grids: 2 columns, 8px apart, 12px between rows, 12px from the card edge. The part page hero uses it at 14px. Only a state (the current scene's blue ring) draws an edge.
- **Focus:** a 2px blue `:focus-visible` ring only.
- **Scrollbars never take space.** Native scrollbars are hidden everywhere (`index.css`); `OverlayScrollbars` (mounted once in `main.tsx`) floats a 6px thumb over whatever is scrolling, fades it 900ms after scrolling stops, and lets you drag it. Never give a scroller a gutter or style `::-webkit-scrollbar` with a width. `.no-scrollbar` opts an element out of the thumb. While a thumb is dragged its scroller has `data-scrollbar-drag` (the agent feed uses it to stop following).
- **CSS layers:** custom classes live in `@layer base` / `@layer components` so Tailwind utilities can override them.

---

## 5. Layout

- **Docked side panels** (Figma reverted floating panels because they cramped the canvas).
  - Each panel is a rounded card (§2) with a 44px header row; window-level controls live in the title bar.
  - **Left (288px):** shows one view at a time, picked in the view rail (§2): **Parts · Robots · Layers · Library**, opening on Parts. Its header names the view.
    - **Robots** (`RobotsPanel`): published robots to insert with their joints (§8c). Search first (“Search robots”, Enter inserts the first), then Imported and a section per kind: Humanoids, Small bipeds, Quadrupeds, Arms (hands are in Parts → Hands). Tiles (2 columns, like Parts) show a preview, the name and the maker; a click inserts it (the toast shows progress) or drags onto the canvas, where it stands at the drop point (§7a-2). Imported comes first: robots inserted from a link, with the preview their import rendered (right-click to remove). Import Robot… (a URDF / MJCF link or folder) is the + in the view's header.
    - **Parts** (`PartsPanel`): search first, then browse. Views stack with no header row of their own: inside a view the search field's glass icon becomes Back (Esc in an empty field also goes back), and the field names the view and searches only it (“Search servos”, “Search screws”, “Search in this scene”; a part page searches its group). No scoped matches shows [Search All Parts].
      - **Search** (always on top, a `SearchField`; ⌘F opens Parts and focuses it from anywhere): matches name, maker, part number, aliases and group words, ranking a word that names the group first (“servo” → servos). A size makes hardware exact: “m3x12”, “M2.5 standoff 12”, “608”. ↑/↓ move, Enter adds, ⌘Enter opens.
      - **Home:** an **In this scene** row (opens a view: Used, with counts, then Goes with these: `pairsWith` of the scene's components and components named in the brief), then Browse rows in two sections: Components (one row per non-empty `ComponentGroup`) and Hardware (one row per `HARDWARE_FAMILIES` family). Parts lists and searches only real components and hardware: basic shapes live in the toolbar's Shapes menu (A), and holes, slots and pivot axes in ⌘K.
      - **Category:** 2-column grid of real 3D thumbnails (`usePartThumbnail`, cached per exact variant). Hover opens a `HoverCard` beside the sidebar. Click opens the page; + adds; drag places it.
      - **Part page:** calm first, details on request. A draggable spotlight hero (no badge), the name (17px semibold), the maker on one muted line and the description; then **Key specs**: at most 3 plain-language rows for newcomers (`keySpecs` in `utils/keySpecs.ts`: Size rounded, Weight, and one headline per group, e.g. a servo's Strength as “Up to 2 kg at 10 cm”, a gripper's Can hold, a LiDAR's Range); **All specs**, collapsed: the exact datasheet values as label/value rows; **Details**, collapsed: part number, Mounting, 3D model source, Datasheet and Product Page; then Goes with. Amazon is a cart icon in the footer beside Add. The hardware page shares the hero and title.
      - **Footer:** part and hardware pages end in a bar below the scroll area (name, Amazon cart icon, Add), so the scroll fade never dims it.
      - **Scroll fade:** the list fades 28px at an edge only while there's more to scroll past it (`useScrollFade`, same look as the agent feed).
      - **Hardware page:** a live preview of the exact spec, the title, then the family's `HardwareConfigurator` and `HardwareSpecs` as hairline sections, and a footer with Find on Amazon + Add. Each family remembers its last spec.
        - **Head / Style / Ends:** the family's types as real 3D thumbnail tiles (3 across, `.preview-sm`, label under), drawn at the current size, finish and drive but the default length, so scrubbing the length doesn't re-render them. The chosen one has the Library's blue ring.
        - **Drive:** a `ChoiceGrid` of tall cells, each a `DriveIcon` over its name; the header's right side names the recess (“PZ2”, “2.5 mm hex key”, “1 mm slot”).
        - **Size** and **Finish** (swatch dot + name): `ChoiceGrid`s. Never solid blue chips: blue is for tools, tiles and focus.
        - **Length:** − / field / + (steps between stock lengths), then the stock lengths in one sideways-scrolling strip centred on the current length, its edges fading only while lengths are hidden past them. A custom length's hint makes the nearest stock lengths clickable.
        - **Specs** (Size, Thread with pitch, Standard, Head Ø × height) and **Holes** (`hardwareHoleRows`: clearance, counterbore or countersink, tap drill, nut trap, printed hole…) use the part page's `SpecRow`s, units muted.
      - **Drive:** every headed screw (Socket, Button, Flat, Pan) takes Hex · Torx · Phillips · Pozidriv · Slotted; Set takes Hex · Torx · Slotted (cross recesses aren't made in grub screws). Chips keep the `DRIVES` order on every head; `defaultDrive` picks the one a head starts with (Pan: Phillips, others: Hex). Every drive comes in every size of its head.
        - Where an ISO standard covers the pair, its table sets the head and recess and the Standard row names it: Socket Hex / Torx (ISO 4762 / 14579), Button Hex / Torx (ISO 7380-1 / 7380-1 TX), Flat Hex / Torx / Phillips / Pozidriv / Slotted (ISO 10642 / 14581 / 7046-1 H / 7046-1 Z / 2009), Pan Torx / Phillips / Pozidriv / Slotted (ISO 14583 / 7045 H / 7045 Z / 1580), Set Hex / Slotted (ISO 4026 / 4766).
        - Other pairs are commercial screws: the head keeps its usual standard's shape and the recess is sized for the thread (`commercialRecess`: Torx per ISO 14579, cross number per ISO 7045, slot per ISO 1580, set screw Torx matched to the ISO 4026 key). The Standard row says where the shape comes from (“ISO 7380-1 head”), and the shopping search leaves the standard out.
        - Code: `screwHead` (set screws `setScrewRecess`) and `screwStandard`. The drive is part of the spec (`spec.drive`), of the name when it isn't the default (“M3 × 8 Slotted Button Head Screw”, “Hex Socket Pan Head”) and of catalog keys (`hardware:type|size|length|finish|drive`).
      - Recesses are cut into the head with a real boolean (`cutRecess` in `three/hardwareMesh.ts`, three-bvh-csg), at the standard's key-engagement depth; Phillips and Pozidriv crosses taper like the ISO 4757 cone (stopping inside any head but a countersunk one), and Pozidriv adds its diagonal ribs. The recess walls render dark.
      - **Lengths are free:** any length from the shortest stock length up to 300 mm in 0.5 mm steps. Stock lengths (ISO 888 preferred + common retail) are one-tap chips, and − / + step between them. A custom length says “Not a stock length. Nearest: 13 or 14 mm.”; past the stock range it suggests threaded rod.
      - **Finish** (`FINISHES`: Black, Stainless, Zinc, Brass, Nylon, Steel) sets the part color and the shopping search. Non-default finishes are part of the name (“M3 × 12 Button Head Screw, Black”). Chips keep one order across types.
    - **Layers:** header with the part and cutout counts, a footer with the overall size (visible, non-reference parts), and rows with color/role glyph. Double-click renames. Eye and lock appear on hover. Right-click opens the part menu. An empty scene leaves Layers empty: just its header, no empty state.
    - **Library** (`LibraryPanel`), in the same voice as Parts:
      - **Search** first (“Search library”, matches names and descriptions; Esc clears), then **Scenes** (newest first) and **Models**, each a 2-column grid with + in its header: Save this scene (⌘S), and the New Model menu (Save Selection, Save Whole Scene, Import SVG…, From Image…).
      - **Tiles** match Parts tiles: a 4:3 thumbnail that zooms on hover, name, one meta line (`59 parts · 2h`, or `347 × 213 × 347 mm`). Scenes open in a tab carry an “Open” badge; this tab's scene has a blue ring. Models show + (Insert) on hover and drag onto the canvas.
      - **Thumbnails** render from the saved parts with the Parts thumbnail renderer (`usePartsThumbnail`: solid, visible parts only; cached per id + save time), never a viewport screenshot with grid and axes.
      - **Hover** opens details beside the panel (`HoverCard`): large preview, saved when, the description, Size, Parts, From catalog and Comments (each only when non-zero), then Open / Show Tab or Insert.
      - **Right-click or ⋯:** Open (Show Tab when it's open elsewhere), Rename, Duplicate (“Sprout copy”, “Sprout copy 2”…), Delete. Double-click a name to rename it in place; renaming a scene that's open renames its tab too.
      - **Delete** takes effect at once with “Deleted ⟨name⟩ · Undo”, which saves it back.
      - Rewrites (rename, duplicate, Undo) never resend the stored thumbnail, since the backend copies it to `ai-reference/preview.png`.
      - Empty sections show one line and one action (“No saved scenes” + Save This Scene).
      - Save to Library keeps every part whole in `node.part` (CAD code and geometry, sculpt meshes, hardware). Inserting a model saved from a scene recreates those parts as one group named after the model, so they stay editable. Older saves without `part` come back as blocks, with a toast saying their CAD shapes weren't saved.
  - **Right (328px):** header tabs **Inspect · Pose · Simulate · Build · Agent** (`PanelTabs`; Pose only while the selection is on a robot, §8c; Simulate while the scene has joints, §8d). Undo/Redo, Export ▾ and its toggle sit in the title bar above it. Build is described in §8b.
  - Mode panels (Sculpt, Sketch, Import SVG) replace the Inspector while they're active, with a title and Done in their own header (§8).
  - Both collapse with a width animation (⌘B / ⌘I); the animated width includes the 8px gap, so the gap closes with the card. The toggles stay in the title bar.
  - **Resizable (`PanelResizer`):**
    - The 8px gap beside the canvas card is the handle: hovering it shows a 2px blue line in the gap, and dragging resizes. Left: 230–480px. Right: 290–620px.
    - Double-click resets the default width (288 / 328).
    - Dragging about 90px past the minimum collapses the panel and restores its default width for next time.
    - Widths persist in `localStorage` (`panel-widths`). The width animation is off while dragging.
- **Canvas overlays:**
  - Centered bottom toolbar.
  - Toasts above the toolbar.
  - No empty-scene prompt: an empty scene is just the canvas.
  - Annotation pins and cards.

---

## 5a. Scene Tabs

Several scenes stay open at once, each with its own parts, undo history, selection, comments and agent conversation.

- **Architecture:** `App.tsx` is the tab host; each tab is a `SceneWorkspace` (`src/SceneWorkspace.tsx`).
  - Every tab stays mounted, so a background agent keeps building and can render its review shots. Background tabs are `invisible` + `inert`, and their `Viewport3D` is `paused` (no render loop; captures still render on demand). Closing a tab frees its WebGL context (`forceContextLoss`).
  - Up to 8 tabs (browsers cap WebGL contexts near 16). A ninth says “Close a scene to open another. Up to 8 stay open.”
  - App-wide state lives in the host and reaches scenes as `studio` (`StudioShared`): preferences, panel open state and widths, libraries, chat list, the agent connection, Settings. Per scene: everything about the scene, Left/Right panel tabs, the palette, toasts.
  - Only the scene in front listens to the keyboard, paste, the menu bar and the dev `__studio` hook. Background scenes skip re-renders for app-wide changes (custom `memo` comparator) and catch up when brought to front.
- **Where:** in the title bar (§2), from 8px after the sidebar toggle to 8px before the scene's actions. `App.tsx` lays the sidebar toggle and `SceneTabs` over each scene's title bar drag region. No glass: the tabs are part of the window chrome.
- **Tabs (`SceneTabs`):** 28px rounded pills (8px corners), 180px wide, shrinking to 96px, 2px apart, on the title bar's centerline.
  - The active tab sits on a flat `#262626` fill (no edge or highlight); its label is `white/90`, 13px medium, and its × always shows.
  - Background tabs are plain labels (`white/50`, `white/80` on hover) with a soft fill on hover and × on hover.
  - Nothing else: no icons or separators. While a scene's agent works, a 12px coral spinner sits before its name.
  - Past their minimum width they scroll sideways (the wheel scrolls; an edge fades only while tabs are hidden past it, measured from layout so sliding tabs don't trigger it).
  - New tabs grow in (`animate-tab-in`); tabs slide into place after insert, close and drop (FLIP, 220ms).
  - Press selects. Drag past 4px reorders. Double-click renames inline. Middle-click closes. × closes (`Close  ⌘W`). Right-click: Rename, Duplicate, New Scene, Reopen Closed Scene, Close, Close Other Scenes, Close Scenes to the Right.
  - Resting 800ms on a background tab opens a small preview card under it: a fresh frame of that scene, its name, and its part count, or the agent's live activity while it works.
  - + (28px) 4px after the last tab: `New scene  ⌘T`.
- **Opening and closing:**
  - New scenes are numbered so open tabs never share a name: Untitled, Untitled 2…
  - Library → a scene: shows its tab if it's open, reuses the tab in front if it's untouched (blank, unrenamed, unused), otherwise opens a new tab after it.
  - Closing a tab stops its agent, saves its chat and ends its session. The toast reads “Closed ⟨name⟩ · Undo” (“…and stopped its agent” when one was running); Undo reopens it in place with its chat. Untouched tabs close silently. Closing the last tab leaves a blank one, which Undo removes again.
  - ⇧⌘T reopens the last 10 closed scenes. Duplicate copies the scene, not the chat.
  - When a background agent finishes: “Agent finished in ⟨name⟩ · Show”.
- **Shortcuts:** ⌘T new, ⌘W close, ⇧⌘T reopen, ⌃Tab / ⌃⇧Tab and ⇧⌘] / ⇧⌘[ next / previous, ⌘1–⌘8 a tab, ⌘9 the last. They work while typing (except with Settings open). ⌘K lists every other open scene under Open Scenes, plus New / Duplicate / Close / Reopen Scene.

---

## 6. Bottom Toolbar

- **Toolbar (`ViewportToolbar`):**
  - Tools: Move V · Rotate E · Scale R · Comment M. Sculpt C appears between Scale and Comment only when Settings → Canvas → Experimental → Sculpt tool is on (off by default).
  - Then a divider, then **Shapes ▾** (A): a 4-column grid of basic-shape thumbnails (Plate, Cube, Shaft, Tube, Wedge, Sphere, Cone, Pyramid, Hex Prism, Capsule, Dome, Ring), then Sketch… and Import SVG….
  - Active tool: solid blue fill.
  - Keep it to tools and creation only. Placement actions (Drop to Floor, Stack) live in the right-click menu, the Inspector and shortcuts (F, S).
- **No view-controls cluster on the canvas.** Grid, snap, trackpad mode and shortcuts live in Settings (§6a); camera views live in View ▸ Camera, ⌘K, the canvas right-click menu and keys 1–4 / Z.
---

## 6a. Settings (`SettingsWindow`)

- Opens from the app menu → **Settings…** (⌘,), ⌘K, or Help ▸ Keyboard Shortcuts / `?` (opens the Shortcuts pane). It remembers the last pane.
- A sheet with a sidebar of panes, like macOS System Settings:
  - **Canvas:** Display (Show grid, Show reference images), Snapping (Move Off/1/2/5/10 mm, Rotate Off/5/15/45/90°), Experimental → Sculpt tool (off by default).
  - **Navigation:** Two-finger scroll Orbit / Pan, plus pan and camera key reminders.
  - **Layout:** Show sidebar / inspector, reset panel widths.
  - **Agent:** Run with Claude Code / Offline, the command (status under it), target height.
  - **Shortcuts:** the full list (`ShortcutsList`).
- **Sheet:** 860 × 620, 18px corners, matte (dark 0.5px keyline + drop shadow, no light ring). The sidebar (224px, `#1c1c1c`) sits on the `#222222` sheet by lightness alone, with no border. Pane items are 34px with a plain 16px icon (`white/40`); the open pane gets a soft fill and `white/90` icon and label, nothing else. The sidebar title and the open pane's title (20px semibold, 64px header) both center on y = 32. Close (Esc) sits at the header's right, its glyph in line with the cards' right edge. No line under the header; the content fades under it instead (`useScrollFade`). Content scrolls vertically only (`overflow-x-hidden`), with 28px side padding.
- **Groups and rows** (`SettingsGroup` / `SettingsRow` in `src/components/SettingsRows.tsx`): a sentence-case group label (12.5px medium, `white/45`) above a rounded inset card; the pane title, group labels and cards share one left edge, and row content sits 16px inside the card (12px corners, `white/[0.035]`), rows separated by full-width hairlines. Rows are at least 52px with 16px side padding: label (13.5px, `white/90`, optional shortcut caps) with an optional hint (12.5px, `white/45`) on the left, the control on the right. `stacked` rows put a text field under the label and the hint under the field. Units are a muted suffix on the label (“Move mm”). Shortcuts use the same cards with 40px rows.
- Grid, snap, trackpad mode and the Sculpt tool setting persist in `localStorage` (`preferences`).

## 7. Inspector (Figma UI3 style)

- Sections are separated by full-width hairline dividers, never boxed cards. Section titles are sentence case and 13px semibold.
- Every Inspect view and mode panel scrolls with `useScrollFade`, like Parts: an edge fades only while there's more to scroll past it.
- **No selection:** Project description (collapsed by default; saved with the scene to `ai-reference/`; no placeholder, like Notes) and Comments (just the title and + when there are none). Scene stats live in Layers: the header shows parts and cutouts, and a footer shows the overall size.
- **Part selected:**
  - Inline-renamable name, then Duplicate / Save to Library / Delete.
  - Hardware shows the same `HardwareConfigurator` sections as Parts (type tiles, drive, size, length, finish) in place of Size and Shape. Specs and Holes come before Notes, collapsed; Holes carries + (Add clearance hole) in its header. Length typing and scrubbing are live; release commits one undo step. The color follows the finish unless it was set by hand.
  - No Solid · Cutout · Guide control: the part type is set from the right-click menu (one part or several).
  - Size W/H/D (+ wall T), Position X/Y/Z (Floor, Stack and Center actions), Rotation X/Y/Z with 90° steps.
  - **Shape** (Round, Taper, Bend, Twist): collapsible, open only when non-zero.
  - Collapsible sections keep their title where a plain section's sits and put the chevron at the far right, after any header actions.
  - Appearance (`ColorField` + material), comments on this part, Notes (sent to the agent; collapsed by default), then Product (maker · part number, specs, mounting, model source, links) for real components.
- **Several parts selected (`MultiInspector`), like a multi-selection in Figma:**
  - Title: the group name (renamed in place, one undo step on Enter or blur), or “N parts”. Under it, the part count and the selection's overall size (`39 × 50 × 39 mm`). Group/Ungroup, Duplicate, Save to Library and Delete sit beside it.
  - **Align:** one icon strip per axis (min · center · max) with Spread beside it (`AlignBar`; Spread needs 3+ parts).
  - **Position:** X/Y/Z of the selection's bounds center. Typing, scrubbing and math move every unlocked part together (`handleMoveSelection` takes an absolute target computed from the latest parts, so Enter + blur can't move it twice). Drop to floor and Center on origin in the header.
  - **Rotate:** X / Y / Z 90° turns the selection as one piece about its center (`handleRotateSelection`).
  - **Combine:** Union / Subtract / Intersect on one strip; Subtract's tooltip names the part it keeps.
  - **Appearance:** `ColorField` and material, each showing “Mixed” when the parts differ.
  - Strips (`StripGroup` + `StripButton` in `AlignControls.tsx`) are the pattern for a row of equal actions: a 32px soft track with 2px inset cells, never a grid of text buttons or tall tiles.
- **`NumberInput`:**
  - Drag the label to scrub (Shift ×10, ⌥ ×0.1). ↑/↓ steps, Enter commits, Esc reverts.
  - Accepts math (`40/2`).
- **Live vs. committed edits:** scrubbing, slider drags and typing call `onChange(value, live=true)`. Those skip undo history until release or blur, which commits one undo step (`commitParts(updater, live)` in `App.tsx`).

---

## 7a. Selection, Groups & Booleans

- **Selection is an ordered list** (`selectedIds` in `App.tsx`). The first id is the primary, and Subtract keeps that part.
- **Canvas:**
  - Click a part to select it, or its whole group. Clicking again keeps the group selected.
  - Double-click a grouped part to drill into just that part. Once inside a group, a single click selects another member.
  - Shift-click or ⌘-click toggles a part in the selection. Clicking empty space clears it.
  - Shift-drag draws a blue selection box and adds every unlocked, visible part it touches, plus their groups. Hit testing uses each part’s real silhouette (projected vertices + a 7×7 ray grid), not its bounding box. It runs in the capture phase and turns OrbitControls off for that drag, so Shift-drag never pans. Shift-scroll still pans.
  - Only primary clicks change selection; right-click never does.
- **Layers:**
  - A plain click selects that row; Shift/⌘-click adds to the selection.
  - Group rows are collapsible, double-click to rename, and select every member.
- **Moving several parts:** the gizmo attaches to a pivot at the selection’s center. Move, rotate and scale apply to every unlocked part and commit as one undo step.
- **Groups:** stored on each part as `group: { id, name }`, so they’re undoable and saved with the scene. Groups are flat (no nesting). ⌘G groups, ⇧⌘G ungroups.
- **Booleans:**
  - With 2+ parts, Union, Subtract (from the primary) and Intersect replace them with one mesh.
  - With one part, Subtract uses every visible Cutout that overlaps it.
- **Selection bar:** with 2+ parts selected, a glass pill above the toolbar shows the count, Union, Subtract, Intersect and Group/Ungroup.
- **Align (`AlignControls`):**
  - X/Y/Z × Left·Center·Right / Bottom·Middle·Top / Back·Center·Front, plus Spread X/Z for 3+ parts.
  - Several parts align to their shared bounds; one part aligns to the origin (Bottom = floor).
  - Bounds include each part's rotation (`halfExtents` in `utils/selection.ts`, checked against three.js `Box3`), so align, spread, drop to floor and the sizes in Layers and the Inspector stay right for rotated parts.
  - Available in the right-click Align submenu, the multi-selection Inspector (`AlignBar`) and ⌘K.
- **Drop to Floor (F):** loose parts each drop to the floor; when every selected part is grouped, the selection lands as one piece.

---

## 7a-2. Drag and Drop

- **Draggable onto the canvas:** Parts tiles, Shapes menu tiles, Library model tiles and Robots tiles. They use `PART_DRAG_TYPE` / `MODEL_DRAG_TYPE` / `ROBOT_DRAG_TYPE` (`{ url, name }`, imported on drop) from `src/data/dnd.ts`, and the tile’s preview is the drag image.
- **Where it lands:** at the drop point, snapped to the grid step. Dropping on a part stacks it on that surface; otherwise it sits on the floor.
- **Shapes menu:** fades out (stays mounted) while dragging, then closes on drag end. Removing the drag source would cancel the drag.
- **Image files** dropped on the canvas become reference images (§7b).

---

## 7b. Reference Images

- **Adding:** ⌘V anywhere outside a text field, drop image files on the canvas (at the drop point), ⌘K → “Add Reference Image…”, or right-click the canvas → “Add Reference Image…”.
- **What they are:**
  - An `image_plane` part with `imageDataUrl` and role `reference`.
  - Unlit, double-sided, with a thin frame that turns blue when selected.
  - Never printed, exported to STL or used in booleans. Listed in the brief as reference photos, not parts.
- **Size:** photos are downscaled to 2048px max (`utils/imageFile.ts`). They start upright with a 120mm long side. Width and height stay locked to the photo’s aspect ratio.
- **Hide all:** the image toggle in the Layers header (shown when the scene has photos), ⇧I, or ⌘K. It’s a view setting, not undoable; hidden photos dim in Layers and aren’t rendered or clickable.
- **Inspector:** an Image section with preview, Opacity, and Stand Up / Lay Flat (backdrop vs. blueprint on the floor). Notes describe what to take from the photo. The Layers row shows the photo as its glyph.

---

## 8. Mode Panels (Sculpt, Sketch, Import SVG)

There's no Shape tab. These panels appear in place of the Inspector only while they apply (`SculptAndDrawStudio`), with the title and a Done button in their own header.

- **Sculpt:** shown while the Sculpt tool (C) is on. The tool is experimental and hidden unless enabled in Settings; when it's off, C, the toolbar button, the ⌘K entry and the Shortcuts row are all gone, and turning it off mid-sculpt switches back to Move. Existing sculpted parts still render and export. Brushes, Size/Strength sliders, Mirror X/Z, Subdivide, Add clay presets. Done switches back to Move.
- **Sketch:** opened from Shapes ▾ → Sketch…, ⌘K or right-click. Extrude / Revolve, Points / Freehand / Hole tools, snap, undo point, clear, then Output fields.
- **Import SVG:** opened from Shapes ▾, ⌘K, right-click or the Library. Drop zone, samples, paste code, preview, then Output fields. “Edit in Sketch” hands the outline to Sketch.
- Adding a part from Sketch or SVG closes the panel and shows the new part in the Inspector.
- Combine lives in the selection bar, the right-click menu and the multi-selection Inspector.

---

## 9. Agent (Claude Code over ACP) and Agent Panel

### Architecture
- The app is an ACP client (`electron/backend-service.mjs`). By default it launches **Claude Code** through `@agentclientprotocol/claude-agent-acp`, using the user's own Claude login (`claude auth login`). The offline tracer `electron/acp-3d-agent.mjs` remains selectable.
- **Session settings:**
  - Claude Code's built-in tools are limited to TodoWrite, WebSearch and WebFetch. File, shell and edit tools are off.
  - CAD instructions are appended to the system prompt (`electron/cad-agent-prompt.mjs`).
  - Thinking is `adaptive` with `display: "summarized"`, so reasoning streams to the UI.
  - Host-session env vars (`CLAUDE_CODE_*`, `CLAUDECODE`, and the desktop host's `ANTHROPIC_BASE_URL`) are stripped, so the agent uses the user's login.
- **Permissions:** anything other than the CAD tools, TodoWrite and web lookups is declined and shown as a toast.
- **One session per scene tab:** one agent process, one ACP session per tab (`sessions`: workspace id → session id in `backend-service.mjs`).
  - Each session's MCP server gets its own bridge URL (`…/<token>/w/<workspace>`), so CAD requests land in that tab's scene. `agent-request`, `agent-status`, `agent-blocked`, `acp-session` and `acp-session-update` events carry `workspaceId`; `App.tsx` routes them to the tab, and answers requests for a closed tab with “This scene was closed.”
  - Prompt, steer, cancel, resume and new-conversation calls take the tab's id. Sessions start lazily on a tab's first message (the first tab, `main`, gets one at launch). A reopened chat resumes its session on the next message. Closing a tab cancels and closes its session.
  - Callers without a workspace id (bench, `tools/parts/generate.mjs`) use `main`, the first tab.
  - A conversation lives in one tab: opening it from History in another tab shows the tab that has it.
- **CAD tools** come from an MCP server (`electron/cad-mcp-server.mjs`): `get_scene`, `model_part`, `get_part_code`, `add_parts` (block-out), `update_parts`, `delete_parts`, `mirror_parts`, `look` (multi-view renders, optionally isolated by ids), `check_scene`, `robot_skeleton` and `set_status`.
  - Evidence: `list_evidence` / `read_evidence` open the files the user attached (images come back as images, text as text). `find_images` lists the photos on a web page (WebFetch drops them) and `view_image` downloads up to 4 for Claude to look at, downscaled to 1568px by the renderer (`downscale_image` request). Both refuse local and private addresses.
  - `robot_skeleton` (`electron/robot-skeleton.mjs`) reads a published URDF or MJCF and returns the exact zero-pose joint positions, axes and offsets in the studio frame. It reads no meshes, so shapes still come from the photos.
  - `find_robot_description` searches GitHub (at most 2 searches and 4 tree reads, to stay inside the unauthenticated rate limit) for a named robot's URDF/MJCF files, and returns raw URLs for `robot_skeleton`. Without it, whether the agent found the description was luck, and scores swung 10+ points between runs. Repositories are ranked by exact-name match before stars, because a top-starred variant (Berkeley Humanoid **Lite**) once led the agent to build a different robot (r25: 62 vs 84).
  - `check_skeleton` checks the model against the same published description: every moving joint must sit inside some part. It fits the floor offset, and lists joints outside the model with their distance and the nearest part. A joint whose left and right frames disagree along its axis (an artefact of the CAD export) is checked as an axis line, not a point.
  - `compare` puts a reference image (`ref-N`, an evidence path or an image URL) beside renders of the model from a matching viewpoint, followed by a checklist: silhouette fractions, shell shapes, feature ownership, and shadows that aren't geometry. The agent uses it after the block-out, per subassembly and at the end.
  - `look` and `compare` take `az:<deg>,el:<deg>` views as well as the named ones (az 0 = front, +90 = the robot's left side).
  - For a straight-on view (front, side or back) and a reference photo on a plain background, `compare` also measures both silhouettes (`src/utils/silhouette.ts`). The photo is segmented by flood-filling the border colour; the model comes from a white-on-black render. It prints span width per tenth of height and flags bands off by more than 15%, since perspective photos distort widths 5–10%. Chasing every band of a perspective photo (r23) cost Memo's drawing match 0.87 → 0.73. On Memo it reproduces the held-out drawing's errors (hands ×0.85 too narrow).
  - `compare` also prints the model's silhouette profile: width and depth for each tenth of the height, as fractions of total height, with the widest parts per band (from part bounds). The agent checks its proportion table against these numbers instead of eyeballing.
  - `find_parts` lists the real-parts catalog (`src/data/components.ts`, `hardware.ts`) through the renderer (`agentCatalog` in `src/agent/agentScene.ts`): catalog keys, exact sizes in the CAD frame, key specs and mounting details.
  - `check_scene` uses mesh-level checks (`src/three/interference.ts`, three-mesh-bvh):
    - parts that pass through each other, with depth (touching is fine)
    - flush same-facing surfaces that flicker, with area
    - solid parts still left as block-out primitives
    The finished model must have none of these.
  - Review renders (`captureViews`) add a headlight, raise exposure and lift the background, so dark parts show their holes and seams.
  - `add_parts` places catalog parts with `{ id, catalog: "component:<id>[|<variant>]" | "hardware:<type>|<size>|<length>[|<finish>|<drive>]", position, rotation }`. They keep the manufacturer geometry, and the agent designs brackets around them. An unknown key is reported as a problem; the rest of the call still applies. Parts sold in versions (STS3215 C001/C018/C044/C046) need the version in the key; a wrong one is an error listing the versions.
  - Any part can stand for a bought supply with `supply: "supply:<id>"` (the battery's envelope): it's counted as that supply in the BOM and weighs what the supply weighs. `material` also takes `pla`, `petg`, `asa`, `tpu` for a part's own filament.
  - `model_part` takes `expect_size`: a part whose compiled bounding box misses it by more than 1 mm or 3% is rejected, not placed.
  - Build tools (§8b): `get_bom`, `set_build` (extras, budget, default filament), `check_printability`, `define_joints`, `verify_design`.
- **References:** every chat image is saved to `library/references/ref-N.<ext>`; numbering continues across sessions, so names stay unique. The prompt tells the agent the names in the order shown.
- **Bridge:** the MCP server talks to the app over a token-protected HTTP bridge on 127.0.0.1. The backend forwards each request to the renderer as an `agent-request` event, and the renderer answers via `respondToAgent`.
- **Agent frame:** Z up, front faces −Y, left +X. `src/agent/agentScene.ts` converts to the Y-up viewport (`scene = (x, z, −y)`), including Euler rotations and mirrored CAD geometry (winding flipped).

### CAD kernel (fidelity)
- Parts are code:
  - **OpenSCAD** (`openscad-wasm`, `--backend=manifold`) with **BOSL2** (`vendor/BOSL2`, pinned commit in `.commit`) and the COTS library `vendor/robotics/robotics.scad`. The library has STS3215, MG996R, SG90, Dynamixel XL430 and XL330 servos and pockets, `qdd_actuator` / `qdd_pocket` pancake actuators (QDD_S/M/L) for humanoid-scale joints, mechanism modules (`servo_u_bracket`, `linear_lift`, `parallel_gripper`), wheels, casters, horns, screws, heat-set holes, a 608 bearing, a Pi Zero, a Pi 5 and an 18650 cell.
  - **replicad** (OpenCascade B-rep) for true fillets, shells and lofts.
- **Sandbox:** `electron/cad-kernel/kernel.mjs` runs as a child process under Node's permission model: read-only access to `node_modules`, `vendor` and the kernel folder, with no writes, no subprocesses and no network. The kernel client keeps a pool of up to 3 processes with a 90s timeout per part.
- **OpenSCAD defaults:** `$fa = 6; $fs = 0.5` on the same line, so error line numbers stay correct. A retry with `$fn = 41` works around a CGAL hull assertion at very low segment counts.
- **BOSL2 patches** (marked `basecase` in `vendor/BOSL2/shapes3d.scad`; re-apply them when you update BOSL2):
  - `cuboid` shrinks a rounding or chamfer that would meet itself (2r = size) to just under the limit.
  - `cuboid` roundings on one edge axis (e.g. `edges="Z"`) extrude a 2D hull instead of a 3D CGAL `hull()` of corners. The 3D hull crashed on everyday enclosures.
- The kernel runs one job at a time per process, so an OpenSCAD instance and its logs are never shared.
- **Errors teach the fix:** OpenSCAD errors keep BOSL2's message and the user's line and module ("Must give two of spacing, n and size — at line 3, in grid_copies()"), without the raw assert source. Common replicad errors get a one-line hint.
- Every compile returns errors (unknown names count as errors), the local bbox, volume and triangle count. The agent must self-check against these.
- **Rendering:** CAD parts are `kind: 'cad_part'` with `cad.{language, code, positions, indices, edges, originOffset, baseSize}`. They render with creased normals and crisp edges, and their code is appended to `DESIGN_BRIEF.md` (§3b).
- **Agent workflow:** read every attachment and evidence file → find its own evidence (web; `find_images` + `view_image` for views the user didn't provide; `robot_skeleton` for published robot descriptions) → measure photo proportions and anchor scale → post a reference sheet (sources, key dimensions with confidence, structure, gaps) → plan (TodoWrite) → block out → `look` and fix proportions → `model_part` each part, reusing block ids → inspect with `look(ids)` → mirror → detail pass and design review against the craft standard (`check_scene` clean) → verify each reference with `compare`, ticking off the feature inventory. Up to 3 rounds.
- **Craft recipes in the prompt** (all compile as written):
  - an electronics enclosure (OpenSCAD)
  - a die-cast finned housing (replicad: fillets after booleans, edge finders, smaller-radius fallbacks)
  - `profileBody`, sculpted shells from front/side/top outlines traced as splines (replicad), which retries with a moved spline seam when a boolean comes back empty

### Live presence
- **Cursor:** each scene op moves Claude's coral cursor (`AgentCursor`, `AGENT_COLOR #d97757`) to the part before the change lands. New parts pop in (`animateSpawn`).
- **Status:** `model_part` emits a `focus` event while compiling ("Designing ⟨part⟩").
- **Camera follow:** the camera frames the model while the agent builds (`frameAll`), and stops following once the user orbits or zooms.
- **Undo:** one undo step per tool call. **Revert Changes** restores the scene from before the run.

### Panel
- **No header row.** History opens from the Agent tab: while it's the open tab, hovering its pill widens it as a chevron fades in from the left beside the label, and clicking anywhere on the pill opens the chat list (`ChatHistory`). New chat sits in the composer next to +.
- **History list:** as wide as the inspector's header content (the card less its 8px header padding; the menu anchors to the tab row, not the pill), grouped by last use (Today, Yesterday, Previous 7 days, then by month) under quiet group labels. Rows are one line: the title, and the time on the right, which Delete replaces on hover. The current chat sits on a soft fill (with Claude's spinner while the agent works); other chats can't be opened during a run.
- **History:**
  - Conversations are saved to `library/conversations/` after each run, and when their tab closes.
  - Opening one restores the transcript and resumes the ACP session (`resumeSession`), so Claude keeps its context.
  - Each chat has a delete action.
- **Transcript (`segments`):** thoughts, markdown text (`Markdown`, GFM) and tool steps appear in the order they streamed.
  - **Follow:** the feed sticks to the bottom while the agent streams. Scrolling up (wheel, scrollbar, keys) stops the follow until you scroll back to the very bottom; a round “Scroll to bottom” button shows meanwhile. Sending a message re-sticks it.
  - **Edge fades:** a 28px mask fades the top and/or bottom of the feed only while there's more to scroll to past that edge (`feedMask`).
  - **User messages** taller than about 9 lines collapse with a fade and Show More / Show Less. Attached images open in `ImageViewer`; folders show as chips with their file count.
  - **No horizontal overflow:** the feed is `overflow-x-hidden`, and text uses `overflow-wrap: anywhere` (code blocks and tables scroll inside themselves).
  - Only content updates (thoughts, text, tool calls, plan) create a reply; session metadata from the adapter is ignored.
  - **Thoughts:** a Brain icon row aligned with tool steps, with no rule or border. While streaming it reads “Thinking” and shows a short window of the newest lines under a top fade. Once done it folds to “Thought ›”, which expands to the full text inline. Thoughts never scroll on their own, so the wheel always scrolls the conversation.
  - **Tool steps:** plain-language labels ("Designing Left Coxa Bracket", "Inspected …", "Studied 4 attached files", "Looked at 2 photos"). `model_part` steps expand to show the code; `view_image` steps expand to show the photos.
  - **Plan card:** shows the agent's TodoWrite list with live status.
- **Empty chat:** the feed is just empty; no title, intro or suggestions.
- **Composer:**
  - The placeholder is a short example, with no “e.g.”, cycling every 3.6s (`CyclingPlaceholder`, `placeholder-cycle` in `index.css`): each wipes in from left to right behind a soft mask edge (1.15s), holds, then fades out (0.5s) before the next. It stays on the first under reduced motion. The examples fit the state: idle (“Desk lamp arm”), with attachments (“Match the photos”), or while the agent works (“Longer legs”).
  - The + menu has Attach Images… and Attach Folder…. Paste or drop images, files or whole folders.
  - Up to 20 images go inline with the message (downscaled to 1568px); click a thumbnail to open it in `ImageViewer`.
  - **Evidence folders** (`src/utils/evidenceFiles.ts`): readable files are copied to `library/evidence/<id>/` (up to 400 per folder): images downscaled to 1568px, text files (notes, URDF/MJCF, BOMs, code) as is, and STLs as `.mesh.txt` summaries with exact bounding box, volume and triangle count. Other files (PDF, HEIC…) are counted as skipped. Loose non-image files and images beyond the inline limit become an “Attached files” folder. The prompt lists every file and tells the agent to read them all with `read_evidence`.
  - **Steering:** sending while the agent works injects the message into the running turn (ACP `_session/steering`, `steerAcpPrompt`); Claude reads it between steps and its reply continues below it. If the turn can't take it (offline agent, or the run just ended), it's queued and marked “Sends after this run”. Stop drops queued messages (“Not sent”). While running with a draft, Stop and Send Now show side by side; Esc in an empty composer stops.
  - Agent choice (Claude Code / Offline), its command and the target height live in Settings → Agent (⌘K → “Agent Settings…”).
  - The send button becomes Stop while running.
- Agent replies that link out open in the system browser (Electron `setWindowOpenHandler`).

---

## 8a. Real Components (Parts library)

Servos, motors, boards and sensors are real products with exact geometry, never estimates.

- **Data:** `src/data/components.ts` (one `ComponentInfo` per product: maker, part number, specs, mounting, links, model source, `pairsWith`). Every number comes from the linked datasheet or drawing. Sizes come from the converted mesh (`component-meshes.json`), so they always match what you see.
- **Scene parts:** `kind: 'component'` + `componentId`. The mesh (`public/parts/<id>.glb`) loads once and is shared (`three/componentMeshes.ts`; never dispose `userData.shared` geometry). Components can't be resized (Inspector, scale gizmo and agent `update_parts` all keep their size). The Inspector skips Size, Shape and Appearance and shows a Product section last, below Notes, collapsed by default.
- **Where meshes come from** (`tools/parts/`):
  1. **Manufacturer CAD first.** `sources.json` lists each official STEP (URL, license, orientation). `node tools/parts/convert-step.mjs <id>|--all` tessellates it with OpenCascade (`occt-import-js`), keeps face colors, turns Z-up into Y-up and writes the GLB. Raw downloads live in git-ignored `tools/parts/cad/`.
     - `"files": [...]` combines several files that share one assembly frame (an enclosure and its PCBA). Check the result: files exported in their own origins don't line up.
     - Files too big for WebAssembly, or IGES whose trimmed surfaces fail, use `"reader": "native"` (`step-native.py`, native OpenCascade through `cadquery-ocp`; point `OCP_PYTHON` at that Python).
     - Makers that publish a robot description instead of an assembly (URDF/MJCF + STL, or one fused STL) go through `node tools/parts/convert-urdf.mjs <id>`: it assembles the meshes at the zero pose. `"rootLink"` takes just the gripper of a full arm; `"modelColors": false` ignores simulation debug colors.
     - Extra bodies (field-of-view cones, keep-out volumes, spare accessories laid out beside the product, the rest of an arm around its gripper): `"hideMeshes"` drops bodies by name, `"keepBox"` keeps only what lies inside a box in the file's own frame.
     - Colors: CAD "no color assigned" defaults (SolidWorks lavender `#cad1ee`, `#97a3da`) become neutral grey; `"colorMap"` sets a real finish for any CAD color (e.g. Trossen's red/blue part colors → black).
     - Orientation: set `"rotate"` so the part sits the way it's mounted (servo horn up, boards component side up, cameras lenses toward +Z, grippers and hands flange down with fingers up), then check front, back, top and side renders.
     - When a published file is incomplete (e.g. no housing surfaces), don't ship it: model the part from the official drawing instead (step 2) and record why in `sources.json` (`note`).
  2. **No official CAD:** the studio's own agent models it from the official drawings. `tools/parts/specs/<id>/` holds the record and drawing images; `node tools/parts/generate.mjs <id…>` (random free port, so stale tabs on familiar ports can't attach) runs the real app headless (like the benchmark) and saves the GLB plus the part code, renders and the agent's notes in `tools/parts/generated/<id>/`. Never hand-model or estimate a component.
  - Community models (GrabCAD, Thingiverse, other robots' repos) don't count as manufacturer CAD.
  - **Checked CAD:** when the maker publishes only drawings (Raspberry Pi 4) or the file comes from a reseller (Unitree GO-M8010-6), a third-party STEP may ship if it's measured against the official drawing first: board or body outline, mounting holes and connector or flange positions within about 0.1 mm. It gets `model.source: 'checked'` with `checkedAgainst: '<maker>'`, and the card says “3D model by ⟨author⟩, checked against the ⟨maker⟩ drawing”. If no file passes, model it from the drawing (step 2).
- **Amazon links:** a verified product page (`kind: 'product'`) when the exact part is listed, else a search (`kind: 'search'`, labeled Find on Amazon). Never guess an ASIN. Hardware tiles link to an Amazon search for the exact spec (`hardwareShopUrl`).
- Estimated generic parts (servo, stepper, board, camera, ultrasonic, hinge, linear actuator, L/U-brackets, beam, standoff, gripper, wheel, bearing block) live in `BLOCKOUT_ONLY`: the agent can block out with them and old scenes still render them, but Parts never lists them. Add a part to Parts only when its geometry is exact.

---

## 8c. Joints, Poses and Motion

A robot is posable once its degrees of freedom are declared. Posing never edits parts: the modeled pose is the design, and a pose only changes what the canvas shows.

- **Data** (`types/robotics.ts`, saved with the scene in `ProjectSettings`): `joints` (`RobotJoint`: revolute in degrees or prismatic in mm, parent and child parts, `parentJoint` when links between joints have no geometry, origin and axis, range, limb), `pose` (the pose on the canvas: values by joint id plus an optional whole-body `root` offset), `poses` (saved) and `animations` (`RobotAnimation`: keyframes with every animated joint, smooth or linear, loop).
- **Several robots per scene:** `buildRig` finds each robot (joints linked through a parent joint or a shared part, plus unlisted parts grouped with one robot's parts) as `rig.robots` (key = its first base joint id, name = its parts' group). The scene pose holds every robot's joint values and each robot's body offset in `roots` by key; `robotRig` gives one robot alone for IK, gaits and mocap, and `withRobotPose` puts its result back without touching the others. Saved poses and animations carry `robot`; the Pose tab, ⌘K Rest Pose, walk cycles and Import BVH… work on the selected robot only, and the agent tools take `robot` (default: the selected one, or the only one). Imported robots get unique joint ids (a second G1's are `left_knee_joint_2`), and scenes saved with repeated ids are renumbered when they open (`uniqueJointIds`).
- **Joints follow their mount:** `frame` stores the pivot in its first parent part's own frame (`anchorJoint`); `resolveJoints` reads it back, so moving or undoing the robot keeps joints in place.
- **Kinematics** (`utils/kinematics.ts`): `buildRig` turns joints into a tree; each part moves with the deepest joint that lists it as a child, a joint's mount moves with the joint above it, and an unlisted part follows its group only when the whole group moves with one joint (a group spanning a whole robot says nothing). `forwardKinematics` composes rest-frame rotations from the base out. `solveIK` is damped least squares (Levenberg–Marquardt) with joint limits; torso joints are stiffer so limbs reach first; `preBend` starts knees and elbows bent the way their range opens (straight joints are singular).
- **Joints belong to their parts.** Deleting parts deletes every joint whose moving side is gone and drops the deleted ids from the rest (`jointsWithoutParts` in `kinematics.ts`, run by every `commitParts`); undo brings parts and joints back together.
- **Undo:** pose changes are on the scene's undo timeline. Each history step (`Snapshot` in `SceneWorkspace`) holds the parts, the joints and the pose; `usePosing` reports every pose edit (sliders, the ring, saved poses, Rest pose, the agent's `pose`) through `onPoseEdit`, and edits less than 700 ms apart fold into one step, so a drag undoes in one go. Playback, scrubbing and pausing aren't recorded.
- **Canvas:** `Viewport3D` takes per-part rest → posed motion (`pose`). Measurements, interference (check_scene), servo outputs and sweeps run in the modeled pose (`withRest`); renders show the pose. Moving a part while posed maps the edit back to the modeled pose.
- **Pose tab** (right panel, beside Inspect, only while the selection is on a robot; P opens it, selecting the first robot if needed). It shows that robot's animations, poses and joints: while it's open, clicking a part picks the joint that turns it, and a single ring on its axis (an arrow for a slider) turns it in 1° / 1 mm steps (Shift is free). Picking a toolbar tool leaves the tab. Contents: Animations (play, scrub, + → Walk Cycle, Import BVH…; right-click for Loop, Rename, Delete), Poses (Rest pose and Save pose in the header; click applies), then one collapsible section per limb (Head, Torso, Left arm…) with label · slider · value rows. The selection bar hides while posing.
- **Animation** (`utils/animation.ts`): `sampleAnimation` (Catmull-Rom or linear; whole-body turns slerp), `buildKeyframes` (values and IK goals per keyframe), `buildGait` (any number of feet; stance feet stay planted, swing feet lift; stride, lift, period, duty, crouch, bob, sway, heading and oscillators default from the leg length). Playback runs in `usePosing` and drives the canvas directly; pausing commits the frame as the pose.
- **Posable hands** (`data/articulatedParts.ts`): catalog parts whose maker publishes a URDF / MJCF with the joints (Amazing Hand, LEAP, ORCA, Ability, Dex3-1, Dex5-1, Allegro, Linker L10 and O6) go in from Parts → Hands (click, + or drag) as that articulated model: links as `mesh` parts, fingers as joints, turned by the same `rotate` as their catalog mesh (`importRobot`'s `rotate` option uses tools/parts' `(x, z, −y)` frame), framed and selected. The palm carries `componentId`, so the Inspector shows Product and the BOM counts the hand once. If the description can't be downloaded, the fixed catalog mesh goes in instead. Hands without a published description (Inspire, HOPEJr, Aero) stay one mesh.
- **The maker's data is never missing:** an import captures everything the checks and tools use (link masses and centres of mass, joint ranges, torque and speed limits), and every link records where it came from (`ScenePart.robotLink`: robot, link, source link, `rotate`, data `version`). When imports start capturing something new: add it to `publishedData` (it feeds both the import and the upgrade) and bump `ROBOT_DATA_VERSION`. Robots below the current version are upgraded from their description alone (no meshes), matched by link and joint name so poses and edits are kept: open scenes when they load (undo history included), saved scenes in the background when the app starts (saved back in place, `keepUpdatedAt`). Older robots without a recorded source are found by name (a preset, a Parts hand, Robots → Imported); one that can't be found gets a toast to insert it again. Animations report joints faster than their speed limit.
- **Published robots** (`utils/robotImport.ts`): URDF and MJCF (defaults classes, includes, hinge chains on one body, visual geoms) with STL / OBJ / DAE / GLB meshes from a URL (GitHub links and Git LFS work; `package://` is resolved against the repository) or a folder. Each link with geometry becomes a `mesh` part (simplified with meshoptimizer toward a ~220k-triangle budget, never past 0.2% error, so cracked published meshes keep more triangles instead of tearing; not printed, not resized); every revolute / prismatic joint keeps its axis and limits. Robot frame (REP-103) → scene: `(y, z, x) × 1000`. Collada keeps the file's own axes. Every import from a link renders a preview (`robotPreviewImage` in `utils/robotPreview.ts`: the Library's thumbnail renderer, cropped to the robot, WebP) after the robot is inserted and remembers it (`localStorage` `robots-imported`). Presets ship theirs in `public/robots/<id>.webp`, made by the same import: `node tools/robots/previews.mjs [id…]` (rerun it when a preset is added). Presets (`ROBOT_PRESETS`, each checked to import whole): Unitree G1, H1, H1-2, Apptronik Apollo, Booster T1, Berkeley Humanoid; ROBOTIS OP3, Open Duck Mini v2; Unitree Go2, Go1, B2, ANYmal C, Spot; SO-101, Franka Panda, UR5e (the Robots view, ⌘K, File → Import Robot…). MJCF `<frame>` elements are followed, and collision-class or group-3 geoms are skipped.
- **Motion capture** (`utils/mocap.ts`): BVH through three's `BVHLoader`, bones matched to landmarks by name (Mixamo, CMU, Daz `lShldr`, UE `upperarm_l`…), robot joints matched by name (`left_knee`, `LL_KFE`, `FL_calf`…). Retargeting points each robot segment the way the performer's segment points (so proportions and rest poses can differ), moves the body by the hips scaled by leg length, and keeps feet on the floor while the performer stands. The Retarget sheet shows the match (changeable), In place, Loop and frame rate.
- **Agent tools:** `get_rig`, `pose` (values, IK goals, body offset, save / apply), `animate` (keyframes or a gait; reports IK misses, limits, collisions and the floor at 8 times; preview frames), `retarget_motion` (an attached .bvh or a URL), `import_robot` (preset or URL); `define_joints` takes prismatic joints and `parent_joint`.

## 8b. Build: BOM, Budget, Printability and Engineering Checks

The Build tab (right panel) and the agent's build tools turn a model into something you can print and buy. Everything here is computed from the scene; nothing comes from agent text. The rules come from docs/research/Printable humanoid engineering (cited there), never from other projects on this machine.

- **Project settings** (`ProjectSettings` in `types/robotics.ts`, saved with the scene): printer (Bambu Lab P1S), default filament, infill, budget, purchase-only extras, declared joints.
- **BOM** (`utils/bom.ts`): components counted by part (and version), hardware by exact normalized spec (`hardware:type|size|length|finish[|drive]`), parts with `supplyId` as that supply, printed parts as filament grams per material (shell + infill model, Bambu densities) plus estimated supports, then spools with a 15% margin; extras by key. Stand-ins (block-out kinds) and parts tagged CNC, laser-cut or hand-modeled COTS are listed as needing a source.
- **Prices:**
  - **Checked:** `library/purchases.json` (app-wide, keyed by catalog key) holds what the user saw on an Amazon listing: canonical `/dp/ASIN` URL, title, pack size, price, local date. Over 60 days old is Stale. The app never fetches Amazon, and the agent never states a price that isn't in the BOM.
  - **Estimated:** `data/listPrices.ts` holds list prices from maker and US distributor stores (never Amazon), each with store, URL and date. Shown as "≈ $" and counted only in the estimated total.
- **Supplies** (`data/supplies.ts`): generic bought goods (batteries with voltage, capacity and C rating, buck converter, wiring, filament, the round face LCD) with an Amazon search for the spec.
- **Printability** (`three/printability.ts`, `utils/printReport.ts`): each printed part in its own frame tries 6 flat orientations; P1S plate 256 × 256 × 250 mm with the 18 × 28 mm front-left keep-out (Bambu's printer profile), long parts across the diagonal; overhangs past 45°, support volume under faces within 30° of horizontal (the stock profile's threshold, Morgan 2016 drop method); walls under 0.84 mm by inward rays; time from extruded volume; shelf-packed plates. Labelled estimates.
- **Engineering checks** (`utils/engineering.ts`), each Pass / Warn / Fail / Not run with a one-line summary (`detail`) and, when something's wrong, one line per problem (`items`, each selecting its parts). Name joints and parts as people read them (“Left shoulder roll: clear to −75° of −100°; at −100° the left hand meets the hip pitch left”), never by id; summarize repetitive results (“No torque data for 23 joints”) instead of listing them:
  - Weight: total mass and centre of mass from printed mass, catalog weights, fastener volume × finish density, supply weights; estimates flagged.
  - Servo torque: the static load at each joint, the worst of holding the distal side across the range and, for legs, standing on that leg (ground reaction under the stance foot). Pass ≤ 1/5 of stall (Robotis), Warn ≤ rated, Fail above. Actuator numbers per version in `ComponentInfo.actuator` / `variants`, with sources.
  - Servo alignment: each servo's output on its joint axis, the output read from the servo mesh's top cap.
  - Joint support: each joint held on both sides by a bearing on the axis, a second servo, or a link that reaches past both ends of a dual-shaft servo.
  - Range of motion: the distal parts swept through the range against the rest and the floor, with mesh interference; reports how far each joint end is clear. Fails for designed joints. Published robots' joints (`RobotJoint.published`) only warn: their limits are the motor's, reached with other joints moved, and contact under 5 mm is links meeting at a hard stop.
  - Published robots: link masses (`ScenePart.massG`) and centres of mass (`ScenePart.com`, in the part's frame), both from `<inertial>`, count as known weights, and each joint's torque limit (`effortNm`: URDF `effort`, MJCF `actuatorfrcrange` / actuator `forcerange`) stands in for servo data: Pass ≤ half of it, Warn ≤ it. Servo alignment and joint support only run when a joint has servos.
  - Servo voltage: battery full-charge voltage against each servo's listed maximum (an STS3215 C001 shuts down above 7.4 V). Current and runtime: peak current against the battery's C rating, plus fuse and runtime estimates.
  - Standing stability: centre of mass over the support polygon, with tipping angle.
  - Heat near servos: PLA touching a servo (PLA softens at 54 °C; servos run at 60–70 °C).
- **Joints** (`RobotJoint`): parent and child parts, actuators, range, limb. With an actuator, the pivot and axis come from the servo's real output. Downstream parts follow from the joint tree.
- **Library joint modules** (`vendor/robotics/robotics.scad`): `STS3215` follows the Feetech drawing: axis 12.5 mm from the case center, Ø19.95 aluminium horns with 4 × M3 on Ø14 on both faces, 1.4 mm beyond the case. `servo_u_bracket` bolts to both horns. `heatset_hole` sizes include the ~0.25 mm printed-hole shrinkage and 1 mm extra depth.
- **UI:**
  - **Budget:** checked total, estimate, a budget field and bar.
  - **Checks:** Run Checks. Before a run, every check (`ENGINEERING_CHECKS`) is listed by name as Not run; after, rows show the result and you click them to select the parts involved.
  - **Parts to buy:** quantity and packs, ≈ estimate or price, open listing, Add Price… sheet with ASIN validation; Export BOM as CSV or Markdown (shown only when there are lines). Empty, it reads just “No parts”.
  - **Supplies.**
  - **Printed parts:** material, infill, per-part size, time, plate and issues.

## 8d. Simulate & Train (MuJoCo)

Stages 3 and 4 of the robotics loop (§1); milestones in [docs/Robotics loop.md](docs/Robotics%20loop.md). The **Simulate** tab (right panel, shown while the scene has joints) runs the scene's robots under MuJoCo physics and trains policies for them.

- **One engine, one model.** MuJoCo runs the live sim (`@mujoco/mujoco`, DeepMind's official WebAssembly build) and training (the `mujoco` Python wheel), both at the **same pinned version**, from the same generated MJCF. Never add a second physics engine. What you train is what you saw.
  - **Updating MuJoCo:** `node tools/sim/update-mujoco.mjs [version]` (latest when omitted) bumps `package.json` and `electron/trainer/pyproject.toml` + `uv.lock` together, then runs `node tools/sim/smoke.mjs`, which fails if the two engines differ in version or in result. Never bump one side alone. We consume upstream releases; we don't fork MuJoCo's C code.
- **The scene is the source of truth.** `src/sim/mjcf.ts` (`buildMjcf`) writes the MJCF from the scene; never hand-edit or store a model file as truth. Fix the design, and the model follows.
  - Bodies: one per joint (`buildRig`), holding the parts that joint moves, under a root body with the robot's base. Robots with leg joints float (free joint); others are welded to the floor. Every other solid part is fixed scenery.
  - Body frames keep the world's orientation at rest (origin = the joint's pivot), so sim poses map back to parts without rotations (`simDeltas` in `useSimulation.ts`).
  - Frames: scene mm Y-up → MuJoCo m Z-up as `(x, −z, y) / 1000` (the agent frame). The robot faces −Y.
  - Geoms: the convex hull of each part's mesh (hull vertices only, `maxhullvert` 96, `inertia="convex"`), mass from `partMasses` (§8b), inertia from the hull. Robot geoms collide with the floor and scenery, not with each other (rest-pose hulls overlap); exact self-collision stays with the mesh sweeps in `three/interference.ts`.
  - Joints and position actuators (a servo): range from `RobotJoint`, force limit from the servos' stall torque (`actuatorOf`), else the published `effortNm`, else an estimate from the weight the joint holds (labelled in the Model section). `kp` reaches full torque about 10° off target, `dampratio` 1, armature from the torque.
  - The start state is the pose on the canvas, lifted to just above the floor.
- **Simulating never edits parts.** Like posing (§8c), the sim only moves what the canvas shows (`Viewport3D.setPose`). Ending it, or editing parts or joints while it runs, returns the canvas to the posed model.
- **Off the main thread.** `src/sim/sim.worker.ts` runs `SimEngine` (`src/sim/engine.ts`, no DOM, so it also runs in Node) in real time × speed and posts body poses per frame. `Simulation.run()` steps a fresh model headless in its own worker (for agent checks) without touching the live one.
- **Controllers:** Hold pose, an animation's keyframes (does the walk cycle really walk?), a trained policy, or Limp. Push shoves the robot sideways with half its weight for 0.15 s.
- **Grab and fling:** while a simulation is loaded, the Move and Rotate gizmos grab instead of edit (`Viewport3D` `onGrab`; parts never change). The dragged part's body is pulled toward the gizmo on a critically damped spring scaled by its robot's mass, with gravity compensated (`SimEngine.grab`, like MuJoCo's viewer perturbation), so a slow drag lifts or turns the robot and a quick release flings it. A multi-selection grabs its first part, and its gizmo follows the robot.
- **Result:** per robot "Standing" or "Fell at 2.4 s" (tilt over 60° or the root below 45% of its start height), tilt and distance moved; Peak torque lists the hardest-working joints (peak / limit, time at the limit), and a click selects the joint's link.
- **Training** (`useTraining.ts`, `electron/trainer.mjs`, `electron/trainer/train.py`):
  - Runs as a child process through **uv**, which installs the pinned Python, MuJoCo and PyTorch on first use into `library/trainer-env` (`--frozen` against `uv.lock`). Without uv the Train section says how to install it.
  - Users pick tasks, not rewards: **Stand** and **Walk** (a forward speed), with a 5 min / 20 min / 1 h budget. Floating robots only.
  - PPO (rsl_rl-style: ELU MLP 256-128-64, adaptive KL step, GAE) over 64 robots stepped together by MuJoCo's threaded `rollout`; about 20K steps/s on an M-series Mac.
  - **Sim-to-real by default:** every robot gets its own friction (0.6–1.3×), link masses (±15%) and servo stiffness (±15%), a random heading and start noise, and is shoved every 2–5 s.
  - Progress streams as `train-progress` events (one JSON line per batch). Stop saves what it learned. The policy is checkpointed every minute, then evaluated in a clean 8 s run.
  - Results go to `library/policies/<id>/`: `policy.json` (the app runs it), `policy.onnx` (anything else runs it) and the `model.xml` it trained on. The scene keeps a `PolicyRecord` in `project.policies`.
- **The policy contract** (`src/sim/policy.ts`, mirrored in `train.py`): observation = gravity, angular and linear velocity in the root frame, command, joint positions − default, joint velocities, last action; action = default + 0.25 × clip(a, −1, 1), every 20 ms. Change both files together and bump `POLICY_VERSION`.
- **Agent tools** (`src/agent/agentSim.ts`, `cad-mcp-server.mjs`): `simulate` (seconds, controller `hold` / `limp` / `animation:<name>` / `policy:<name>`, shoves by direction and share of body weight, rendered frames) reports falls, tilt, travel and each joint's peak effort against its limit; `train_policy` (stand / walk, minutes) starts training and returns; `training_status` reports progress and the policies with their clean-run results. The prompt has the agent simulate every legged design (hold, then shoves) and fix the design, not the test. `__studio.simTool(kind, payload)` runs the same tools in dev.
- **Not done yet:** sim results as engineering check rows (Pass / Warn / Fail), Reach for arms, action latency randomization, self-collision between non-adjacent links, cloud GPU training.

## 9a. Benchmark (agent fidelity)

`bench/` measures how close the agent's model is to the real robot. Never tune the agent for one robot: every change must be general engineering practice.

- **Tasks** (`bench/robots.mjs`):
  - **URDF robots:** Reachy Mini, Open Duck Mini v2, Berkeley Humanoid and Unitree G1 are scored against meshes assembled from their published URDFs, at the zero pose or a `pose` override (G1's elbows are straightened to match the photos).
  - **Photos only:** robots marked `offline` run with web tools off (`STUDIO_AGENT_OFFLINE=1`), which tests design skill rather than lookup. G1 runs this way.
  - **No public CAD:** Memo (Sunday Robotics) gets the user's four photos. Its held-out orthographic front drawing scores the silhouette (`bench/drawing.mjs`). MicroDuck has only a kinematic skeleton.
  - **Single parts** (`part-xl430`, `part-oak1`): the agent models a catalog part itself from photos, without placing it. The result is scored against the manufacturer's own mesh (`bench/glb.mjs` reads the GLB) over all 24 axis orientations. The judge compares it with renders of the real part in `judge-refs/`.
  - **New concepts:** text-only briefs (a wheeled home helper, a desktop biped), judged against the brief.
  - **Builds** (`build: true`): a brief that must also pass the build checks (`build-humanoid`: a ~50 cm Sprout-style humanoid for the P1S with an $800 budget). The run also saves `scene.json` (open it in the app), `build-bom.txt`, `build-print.txt` and `build-verify.txt`.
- **Vision judge** (`bench/judge.mjs`). For concepts it also gets the assembly tree (part names by subassembly) and `render-internals-iso` (outer shells hidden), so it can credit mechanisms behind covers.
- **Vision judge details:** headless Claude Code with only the Read tool grades the renders on a fixed 0–10 rubric. Replicas are graded against the photos (proportions, shapes, structure, details, overall); concepts against the brief (brief, engineering, cad, design, overall). It lists the five biggest problems, and runs after every benchmark run (`--no-judge` skips it).
- **Run:** `node bench/fetch.mjs <robot>` once, then `node bench/run.mjs <robot> --port 519x --run <name>`. Each run starts its own Vite server and headless Chrome (playwright-core) and sends the robot's photos to Claude Code through the real app. It saves `agent.stl`, `parts.json`, renders and `overlay.png` to `bench/runs/<name>/<robot>/`.
  - Give each concurrent run its own free port. The harness refuses to use a busy one.
  - Each run works on a snapshot copy of the app in the temp folder, with `node_modules` linked. Edits made during a run can't hot-reload into it, and its chats and images stay out of `library/`.
- **Score** (0–100):
  - 4/9 mean silhouette IoU (front, side, top), at the best of 4 yaw turns (all 24 orientations for single parts).
  - 5/18 Chamfer distance relative to 10% of height.
  - 1/6 height ratio.
  - 1/9 width and depth proportions, on robust 0.5–99.5% surface extents.
  - Part count is reported but not scored: URDFs merge each link into one mesh, so matching their count would punish real fasteners and catalog parts.
- **Replay:** `node bench/replay.mjs <run> <robot> [--views …] [--only "a,b;c"] [--keep]` rebuilds a run's final model from its tool calls, recompiling each part. It renders the model (optionally subsets of parts, for bisecting visual artefacts) and saves `fit.json` and `parts.json`.
- **Compare:** `node bench/report.mjs [runs…]`. After changing the scorer, run `node bench/rescore.mjs <run…>` so old runs use the same metric. `node bench/joints.mjs <urdf>` prints a URDF's zero-pose joint positions.
- `bench/data/` and `bench/runs/` are git-ignored, since they hold downloaded meshes and results.
- **Results** (current scorer; runs vary about ±3 points):

  | Robot | r1 baseline | r3 / r4 |
  |---|---|---|
  | Berkeley Humanoid | 63.9 | 81.8 / 77.7 |
  | Reachy Mini | 75.2 | 78.7 / 76.9 |
  | Open Duck Mini v2 | 68.8 | 73.9 / 75.8 |

  Silhouette IoU is 0.70–0.85 and Chamfer distance 1.3–2.2% of height.

  Harder tasks: Unitree G1 runs photos only; Memo has no public CAD; the two concepts are text-only. The vision judge varies about ±4 between runs.

  | Task | Metric | r5 baseline | r7 | r8 | r9 |
  |---|---|---|---|---|---|
  | Unitree G1 | geometry score | 62.3 | 80.6 | 73.0 | 86.7 |
  | Unitree G1 | judge | 56 | 60 | 64 | 56 |
  | Memo | front drawing IoU | 0.845 | 0.818 | 0.771 | 0.844 |
  | Memo | judge | 56 | 64 | 62 | 64 |
  | Concept: home helper | judge | 56 | 62 | 70 | 64 |
  | Concept: desk biped | judge | 62 | 60 | 64 | 66 |

  Rounds 12–20, nine runs each (current scorer; Memo is drawing IoU × 100; concepts are the judge score):

  | Task | Best | Mean | Worst |
  |---|---|---|---|
  | Dynamixel XL430 (part) | 91.9 | 90.3 | 89.4 |
  | Luxonis OAK-1 (part) | 90.8 | 87.4 | 85.8 |
  | Berkeley Humanoid | 88.5 | 82.7 | 71.5 |
  | Reachy Mini | 86.4 | 79.9 | 73.0 |
  | Unitree G1 (photos only) | 84.4 | 76.9 | 43.1 |
  | Open Duck Mini | 77.9 | 73.8 | 66.9 |
  | Memo (drawing IoU) | 87.2 | 85.6 | 82.5 |
  | Concept: home helper | 66.7 | 62.0 | 53.3 |
  | Concept: desk biped | 66.7 | 65.2 | 63.3 |

  Known limits:
  - Run-to-run spread is 10–40 points on robots. It's driven by the agent's choices (pose, photo reading, whether research finds the URDF) more than by tools.
  - Memo's front photo is a perspective render with the hands angled, while the held-out drawing is orthographic. Matching the photo exactly (r20, every band within 10%) lowered the drawing IoU, so this task has a ceiling near 0.87 with these inputs.
  - Concept scores depend on a strict judge. 9/10 means production-grade design and engineering.

  What each round changed:
  - **r7:** photo reading, `compare` and the proportion table.
  - **r8:** shape recipes and the mechanism checklist.
  - **r9:** the numeric profile in `compare`, the explicit neutral pose and the real-parts catalog. Most of the remaining gap is shell shape (head heights) and the part-count term, since reference URDFs count every mesh.
- **Lessons so far:**
  - Build in the neutral home pose: URDFs and CAD assemblies are drawn with every joint at zero.
  - For open-source robots, read the published robot description with `robot_skeleton`. WebFetch summarizes pages and loses exact numbers.
  - Score sizes on robust surface extents (0.5–99.5 percentiles), so thin antennas and cables don't dominate.
  - The agent must see the reference next to its own render (`compare`). From memory it misreads shadows as geometry, puts features on the wrong part, and drifts on relative sizes such as base vs column.
  - A proportion table per subassembly (z range and width as fractions of height) before the block-out fixes most layout errors on robots with no published CAD.
  - Proportions come right before shapes do. The prompt's shape recipes (tapered `prismoid`, front/side silhouette intersection, replicad lofts, ellipsoid heads) are how shells stop looking like boxes.
  - Prompt examples leak into results. A servo-housing example made the agent add vents and a split housing to the XL430 that the real part doesn't have. Keep examples on unrelated objects, and require a feature inventory from the references: model what's there and nothing else.
  - Every code example in the prompt must compile exactly as written (extract and run it). In this session that caught the replicad XZ-plane sign trap, a silently empty spline boolean at certain point counts, and `shell()` failing silently on spline bodies.
  - Test new tools against a real headless snapshot, not hand-made fixtures. In round 9, a fixture with an extra `size` field hid a crash in `compare`.
  - New designs are judged on whether mechanisms are visible and credible: an actuator per DOF, a lift with rails and a carriage, visible wheels, a stability check, and somewhere for the electronics to live.
  - Benchmark hygiene:
    - Run each benchmark from an app snapshot.
    - Preflight the CAD kernel, since a sandbox path error silently turns every part into a block.
    - Never compare runs scored by different metric versions.
  - Compare block-out bounds with ratios measured in the photos before adding detail.

---

## 10. Annotations (comments in 3D)

- **Comment tool (M):**
  - Click a part or the floor to drop a pin.
  - Pins attached to a part follow it (`partId` + `offset`).
  - Pins are Figma-style speech-bubble markers, numbered by creation. On hover they expand to preview the first comment.
- **Thread card (glass):** header `#n on Part`, then Resolve, Delete thread (two clicks), Close. Comments can be edited (marked “edited”) or deleted. Reply composer at the bottom.
- **Persistence:** resolved threads are hidden on the canvas but still listed in Inspect → Comments. Annotations save with the scene and appear in `DESIGN_BRIEF.md` (§4) and `design-spec.json`.

---

## 11. Menus, Palette & Shortcuts

- **Right-click (`ContextMenu` primitive):**
  - **Part:** Duplicate, Save to Library, Comment Here, Align ▸, Drop to Floor, Stack, Reset Rotation, Zoom, Solid/Cutout/Guide, Subtract Overlapping Cutouts, Ungroup, Select All, Lock, Hide, Delete.
  - **Several parts** (right-click inside the selection keeps it): Union, Subtract from {first}, Intersect, Align ▸, Drop to Floor, Solid/Cutout/Guide (checked only when all match; reference photos keep their role), Group/Ungroup, Duplicate, Select All, Save to Library, Delete.
  - Submenus (`submenu` entries) open on hover, flip left near the window edge, and can hold custom content.
  - **Empty canvas:** Add Part…, Comment Here, Add Reference Image…, Sketch…, Import SVG…, Select All, camera views, Reset View, Show Grid, Save Scene, Export STL.
  - Select All (⌘A) is in every menu. Like ⌘A and ⌘K, it skips hidden parts and hidden reference photos.
  - Right-drag and two-finger press-drag pans never open the menu. macOS fires `contextmenu` on press, so the canvas menu opens on release, and only if the pointer moved 5px or less (`menuPressRef`). Windows' release-then-`contextmenu` order is handled the same way. A two-finger tap within 400ms of a wheel event (scroll, pinch or momentum) is ignored too (`TRACKPAD_TAP_GRACE_MS`). Scrolling closes an open menu.
- **⌘K command palette:** every part, model, tool, view and scene action.
- **Shortcuts:**
  - Tools: V/E/R/C/M, A shapes. P opens the Pose tab.
  - Placement and view: F floor, S stack, Z zoom, 1–4 views.
  - Edit: ⌘Z / ⇧⌘Z, ⌘C / ⌘X / ⌘V, ⌘D, ⌫, ⌘A select all, ⌘G / ⇧⌘G group, Esc (closes draft → thread → comment mode → selection).
  - App: ⌘S Save Scene, ⌘F Find Parts, ⌘, Settings, ⌘B / ⌘I panels, ? Settings → Shortcuts.
  - Scenes: ⌘T new, ⌘W close, ⇧⌘T reopen, ⌃Tab / ⇧⌘] next, ⌃⇧Tab / ⇧⌘[ previous, ⌘1–⌘9 (§5a).
  - **Copy, cut and paste** work on the clipboard events (the Edit menu's native roles, so text fields keep native editing). Copied parts live in memory, shared by every tab; the system clipboard holds only a marker type (`application/x-basecase-parts`), so ⌘V pastes parts only while nothing newer was copied, and a pasted image still becomes a reference plane. Pastes keep names, get new ids and groups, and drop `jointId`. In the same scene each paste steps 15 mm (like Duplicate); after a cut or in another scene the first paste lands in place. Cut reads “Cut ⟨name⟩ · Undo”.
  - Every new command gets a palette entry, and a tooltip shortcut when it has one.

---

## 12. 3D Canvas

- Background `#1b1b1b` (the canvas card) with a soft CSS vignette.
- **Lighting:** a `RoomEnvironment` environment map (intensity 0.5, like the Parts thumbnails), a hemisphere light, the shadow-casting key light, a cool rim light, and a soft fill that follows the camera. Dark plastic reads through its reflections, so don't remove the environment map.
  - Near-black part colors render no darker than HSL lightness 0.13 (about `#212121`; `displayColor` in `three/buildPartMesh.ts`). Maker CAD often paints black plastic `#020202` (the STS3215), which no light can show.
- **Infinite grid** (`three/infiniteGrid.ts`): a camera-following shader plane on y = 0, not a fixed `GridHelper`.
  - 1 / 10 / 100 / 1000 mm lines fade in and out by on-screen density, so there's no moiré when zoomed out or at grazing angles.
  - The red X and blue Z axes run forever, and the grid fades into the distance (the fade distance scales with zoom).
  - `toneMapped: false` keeps line contrast exact; lines sit about 15–25 levels above the background, and the axes are brighter.
- Edges: Figma blue `#0d99ff` for selection, red `#ef4444` for cutouts.
- Catalog components (manufacturer meshes) and hardware (fasteners) draw their edge lines only when selected or set as a cutout. Unselected, their dense feature edges showed through enclosing shells as dark specks; the judge read those as overlapping geometry.
- B-rep edges are drawn only at creases (over 20° between the faces on each side). Smooth seams from lofts, splines and tangent fillets aren't outlined, so lofted shells don't get contour stripes.
- The directional light's shadow `normalBias` scales with the shadow frustum (about 1.5 shadow-map texels), so large robots don't get shadow-acne specks.
- Solid part faces use a small polygon offset, so edge lines always draw cleanly on top. Without it, outlines lying on another surface (a flush panel, a coincident face) flicker as dark speckles.
- Gestures: two-finger orbit (or pan), Space-drag pan, pinch zoom, gizmo drag.
- **Cursors** (`CURSORS` in `src/design-system/cursors.ts`, Figma-style): the canvas has its own arrow (near-black, white 1.5px stroke, every corner rounded, soft shadow), the same shape as Claude's coral `AgentCursor`, so the two read as a pair. Comment mode shows a bubble in the pin's shape and the arrow's colors; its tip corner is where the pin's corner lands. Sculpt shows an outlined crosshair. Space-pan keeps the system grab hands.
  - They're CSS cursors drawn by the OS (never a DOM element following the pointer), so they never lag. Each is a 32 × 32 px SVG shipped at 2x in `image-set()` for Retina, with its hotspot on the exact pixel the tip shows (the arrow's stroke tip at (3, 3)).
  - The canvas element inherits its wrapper's cursor (`.canvas-cursor > canvas` in `index.css`), because three.js controls write `cursor: auto` onto the canvas. Comment pins use the arrow too.
- **Zoom range** 25 mm – 12 m camera distance (`MIN_DIST` / `MAX_DIST` in `Viewport3D.tsx`), enough for humanoids.
  - The far plane is 80 m, and the near plane scales with distance.
  - Grid fade, shadow plane and the directional light's shadow frustum all follow the camera distance.
- **Shift while using the gizmo** turns off grid, angle and scale snapping for smooth motion. A “Snapping off” glass chip shows while dragging. Commits keep 0.1 mm / 0.1° precision instead of rounding to 0.5 mm / 1°. Shift-dragging a gizmo handle never starts a box select (`transformControls.axis` check).

---

## 13. Functional Invariants (never break these)

1. CSG booleans: Union, Subtract (cutouts) and Intersect.
2. Exact parts only in Parts: real components (servos, motors, boards, sensors, cameras), ISO hardware (screws, nuts, washers, inserts, standoffs, pins, bearings) and basic shapes. Estimated stand-ins (generic servo, board, bracket, wheel, gripper…) aren't listed but still render in old scenes and as agent block-outs.
3. Vertex sculpting with brush size and strength (behind the Sculpt tool setting).
4. Binary STL export and SVG-to-3D extrusion import.
5. AI workspace sync: scene, part dimensions, annotations and markdown brief saved to `ai-reference/` and `library/`.
6. Vite ignores `library/` and `ai-reference/` (`server.watch.ignored`), so saving never reloads the page.

---

## 14. Shared Design System (`src/design-system`)

Use these primitives. Never hand-roll a styled `<button>` or input when one fits.

- `Button` (primary, secondary, ghost, danger, contrast; xs/sm/md; optional `title` + `shortcut` tooltip)
- `IconButton` (required `title`, `shortcut`, `isActive` solid accent, `isToggled` soft fill; xs/sm/md/lg)
- `Tooltip` (portal, 500ms delay, instant while “warm”), `Kbd`
- `NumberInput` (scrub, math, live/commit), `Slider` (double-click resets), `Switch`, `TextInput` (`bare` for inline rename), `TextArea`, `Select`
- `SearchField`: the search at the top of a sidebar view. 40px tall, 10px corners, 14px text, a 16px glass icon; the whole field is the click target. `onBack` swaps the glass icon for a Back button in the same spot (the text doesn't move), for drilled-in views. Idle it shows its shortcut as key caps on the right (hidden on focus); with a query, a round clear button takes that spot. Focus is a 1px blue ring with a soft 3px blue halo. Use it for any list-filtering search; keep `TextInput` for form fields.
- `ColorField`: swatch + hex field. The picker opens beside the inspector with a saturation/brightness square, hue strip, hex input, eyedropper (`EyeDropper` API) and “In this scene” colors. Never list fixed swatch rows.
- `SegmentedControl` (sliding thumb, `tone: 'danger'`) for choices inside content, `ChoiceGrid` for a choice from a list that wraps (sizes, finishes, drives; `stacked` puts an icon over the label) on the same soft track and thumb (`CHOICE_TRACK`, `choiceCellClass` in `choiceStyles.ts` for hand-built strips), `PanelTabs` for a card's views (quiet labels, the current one on a soft pill; content-sized; when they don't fit they scroll sideways (the wheel scrolls too) with a 24px edge fade only while tabs are hidden past it, and the current tab scrolls into view clear of the fade; a tab's `menu`, while it's the current tab, widens its pill on hover as a chevron fades in, and a click anywhere on the pill opens it; for optical balance its right padding is 11px, selected or not, and 7px with the chevron, whose glyph carries 3px of air), `AgentSpinner` (Claude's coral ring), `Section` (hairline; collapsible with a chevron at the right, styled like the header actions: down when collapsed, up when open), `SectionHeader`
- `Divider`: full-width hairline that cancels the container's `--pad-x` (§4)
- `FloatingIsland` + `IslandDivider`, `PopoverMenu` + `MenuItem` / `MenuLabel` / `MenuDivider`, `ContextMenu` (at least 210px, grows to fit its longest label + shortcut, up to 280px)
- `CURSORS` (`cursors.ts`): the canvas cursors (§12); `ARROW_PATH` is shared with `AgentCursor`.
- Custom icons (`icons.tsx`): `PartsIcon`, `RobotsIcon`, `LibraryIcon`, `LayersIcon`, each `{ filled?, className? }` (outline idle, filled active); `DriveIcon` (`{ drive }`: a screw head with its solid Hex, Torx, Phillips, Pozidriv or slot recess; one state). New ones follow the `icon-design` skill.
- `SpecRow` (`components/PartDetails.tsx`): the part page's label-left, value-right row (13px); used by part pages and `HardwareSpecs`.
- `SceneTabs` (`src/components`): the scene tab strip (§5a)
- `ExportMenu` (`src/components`): the title bar's Export button and its format menu.
  - `PopoverMenu` anchors to its parent (the trigger's `relative` wrapper) but renders in a portal with fixed positioning, so docked panels with `overflow-hidden` never clip it. It flips to the other side when its preferred side has no room, stays 8px inside the window, and follows the trigger on resize and scroll.
- `Modal` (portal sheet), `Toast` (with action), `EmptyState`, `Badge`
- `HoverCard`: rich details on hover (450ms delay; neighbours wait 220ms while warm so you can cross a tile to reach the card's links). `beside="aside"` opens it next to the panel instead of over the grid. It slides in from the panel (`animate-card-in`), is 320px wide, unpadded (content pads itself) and never taller than the window.
  - The Parts card (`CatalogDetails`): spotlight hero with a badge for where the model came from (maker CAD, from the drawing, ISO dimensions), name, maker · part number, a two-line description, a Size headline plus four spec tiles (`Stat`), and a footer with Buy on Amazon and icon links. Mounting stays on the part page.
- `useScrollFade(px?, axis?)`: returns `{ ref, style }` for a scroll container; fades top and bottom (left and right with `axis: 'x'`) only while content is hidden past them.
- Thumbnails (`three/partThumbnails.ts`) render at 480 × 360 with a studio environment map, so metals read on dark tiles; dark parts get more exposure.
- `ImageViewer`: full-window image viewer. Pinch or ⌘-scroll zooms at the pointer, two-finger scroll and drag pan, double-click toggles fit / 100%+, − + 0 keys, ← → and a filmstrip for several images, Esc or a backdrop click closes. Controls float in glass islands.
- Tokens in `theme.ts` (`THEME_COLORS`, `LAYOUT`, `DRAG_REGION`, `NO_DRAG_REGION`) mirror the `@theme` block in `index.css`.

---

## 15. Verification Checklist

- [ ] `npm run build` passes with 0 errors.
- [ ] `npm run lint` reports 0 errors and no new warnings.
- [ ] Stoplights, title bar controls and tabs all center on y = 22, 8px from the top and from the cards; cards keep 8px gaps, 12px corners and 12px content insets (§2).
- [ ] No fake stoplights or slogans. Every new or changed string passes the copy checklist (§3d): nothing repeats what the UI already shows, nothing is named by its absence, no “yet”.
- [ ] Text and controls meet the §4 minimums (nothing smaller than 12px except key caps).
- [ ] Floating surfaces are matte (solid fill + shadow, no blur or highlight); cards and chrome are solid (chrome slightly translucent only via Electron vibrancy).
- [ ] Rail icons center under the close button (x = 26); card header rows center on y = 66 with the first rail icon.
- [ ] Greys are neutral (no blue tint); no outlines on cards and no line under card headers (dividers inside panels are fine).
- [ ] Dividers run edge to edge of their container (`Divider` / `MenuDivider`, never an inset `mx-*` hairline).
- [ ] New UI uses `src/design-system`, has tooltips with shortcuts, and appears in ⌘K when it’s a command.
- [ ] Update this file whenever a new UI pattern or copy convention is adopted.
