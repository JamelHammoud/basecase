# Menus, palette and shortcuts

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 11. Menus, Palette & Shortcuts

- **Right-click (`ContextMenu` primitive):**
  - **Part:** the part's name heads the menu; clicking it copies the name. Then Duplicate, Save to Library, Reference Part (desktop only: opens the Agent tab with the part quoted in the composer, `partQuote`), Comment Here, Measure From Here, Align ▸, Drop to Floor, Stack, Reset Rotation, Zoom, Solid/Cutout/Guide, Subtract Overlapping Cutouts, Ungroup, Select All, Lock, Hide, Delete.
  - **Several parts** (right-click inside the selection keeps it): Union, Subtract from {first}, Intersect, Add Hinge and Add Slider (exactly two parts: the first is the parent, §8c), Align ▸, Drop to Floor, Solid/Cutout/Guide (checked only when all match; reference photos keep their role), Group/Ungroup, Duplicate, Select All, Save to Library, Delete.
  - Submenus (`submenu` entries) open on hover, flip left near the window edge, and can hold custom content.
  - **Routine step** (Routines view, §8j): Add Step After, Delete (⌫). The Start step has only Add Step After.
  - **Empty canvas:** Add Part, Comment Here, Measure From Here, Add Reference Image, Sketch, Annotate, Delete Marks (with marks), Import Mesh, Import SVG, Select All, camera views, Reset View, Add Camera View, Collapse / Expand Camera Views (while the scene has camera views), Show Grid, Export STL.
  - **Camera tile** (§8l): the camera's name heads the menu; Look Through, Rename, Lens ▸; stationary cameras add Use Current View and Delete.
  - Select All (⌘A) is in every menu. Like ⌘A and ⌘K, it skips hidden parts and hidden reference photos.
  - Right-drag and two-finger press-drag pans never open the menu. macOS fires `contextmenu` on press, so the canvas menu opens on release, and only if the pointer moved 5px or less (`menuPressRef`). Windows' release-then-`contextmenu` order is handled the same way. A two-finger tap within 400ms of a wheel event (scroll, pinch or momentum) is ignored too (`TRACKPAD_TAP_GRACE_MS`). Scrolling closes an open menu.
- **⌘K command palette:** every part, model, tool, view and scene action. Add Hinge and Add Slider are listed while exactly two parts are selected. The Agent group has each slash command (Teach a Skill, Make a Routine, Make a Case, Simulate the Scene, Operate the Robot, Run Checks), which opens the Agent tab with `/<command> ` in the composer. The Operate group (§8k) has Connect Emulated Robot, Set Up Servos and Calibrate Servos, each opening the Operate tab first; Set Up Servos is listed only while it can start.
- **Slash commands** (`src/agent/slashCommands.ts`, `components/agent/useSlashMenu.ts`, `SlashMenu.tsx`): typing `/` at the very start of the composer opens a menu above it (`PopoverMenu` with `MenuItem`s, the command and a muted hint): `/train`, `/routine`, `/case`, `/simulate`, `/operate`, `/check`, filtered as you type (prefix matches first). ↑ ↓ move (wrapping), ↩ or Tab inserts `/<command> ` and keeps focus, Esc closes it and leaves the text; a click in the composer keeps it open. The same list opens from the composer's + menu → Commands, which keeps whatever is typed and puts the command in front of it (`withSlash`). The agent reads each one through the prompt's Slash commands section.
- **Shortcuts:**
  - Tools: V/E/R/C/M, D measure, N annotate, A shapes. P opens the Pose tab.
  - Placement and view: F floor, S stack, Z zoom, 1–4 views, ⇧I reference images, ⇧V camera views.
  - Edit: ⌘Z / ⇧⌘Z, ⌘C / ⌘X / ⌘V, ⌘D, ⌫, ⌘A select all, ⌘G / ⇧⌘G group, Esc (ends a Set Up Servos walk, §8k → closes draft → thread → comment mode → measurement → Measure tool → Annotate → picking a joint axis → selection).
  - Routines view (while it has focus, §8j): ⌘Z / ⇧⌘Z undo and redo Routine edits (the view owns its edits through `data-own-edits`, so the scene's history is untouched), ⌫ deletes the selected step, Esc clears the selection, ↑ ↓ Home End move through the step menu. ⌘↩ runs the open Routine whenever the Routines view is open.
  - App: ⌘F Find Parts, ⌘P Print (Lay Out Plates), ⌘, Settings, ⌘B / ⌘I panels, ? Settings → Shortcuts.
  - Scenes: ⌘T new, ⌘W close, ⇧⌘T reopen, ⌃Tab / ⇧⌘] next, ⌃⇧Tab / ⇧⌘[ previous, ⌘1–⌘9 (§5a).
  - **Copy, cut and paste** work on the clipboard events (the Edit menu's native roles, so text fields keep native editing). Copied parts live in memory, shared by every tab; the system clipboard holds only a marker type (`application/x-basecase-parts`), so ⌘V pastes parts only while nothing newer was copied, and a pasted image still becomes a reference plane. Pastes keep names, get new ids and groups, and drop `jointId`. In the same scene each paste steps 15 mm (like Duplicate); after a cut or in another scene the first paste lands in place. Cut reads “Cut ⟨name⟩ · Undo”.
  - Every new command gets a palette entry, and a tooltip shortcut when it has one.
