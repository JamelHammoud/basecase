# Menus, palette and shortcuts

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 11. Menus, Palette & Shortcuts

- **Right-click (`ContextMenu` primitive):**
  - **Part:** the part's name heads the menu; clicking it copies the name. Then Duplicate, Save to Library, Comment Here, Measure From Here, Align ▸, Drop to Floor, Stack, Reset Rotation, Zoom, Solid/Cutout/Guide, Subtract Overlapping Cutouts, Ungroup, Select All, Lock, Hide, Delete.
  - **Several parts** (right-click inside the selection keeps it): Union, Subtract from {first}, Intersect, Align ▸, Drop to Floor, Solid/Cutout/Guide (checked only when all match; reference photos keep their role), Group/Ungroup, Duplicate, Select All, Save to Library, Delete.
  - Submenus (`submenu` entries) open on hover, flip left near the window edge, and can hold custom content.
  - **Empty canvas:** Add Part, Comment Here, Measure From Here, Add Reference Image, Sketch, Annotate, Clear Marks (with marks), Import Mesh, Import SVG, Select All, camera views, Reset View, Show Grid, Save Scene, Export STL.
  - Select All (⌘A) is in every menu. Like ⌘A and ⌘K, it skips hidden parts and hidden reference photos.
  - Right-drag and two-finger press-drag pans never open the menu. macOS fires `contextmenu` on press, so the canvas menu opens on release, and only if the pointer moved 5px or less (`menuPressRef`). Windows' release-then-`contextmenu` order is handled the same way. A two-finger tap within 400ms of a wheel event (scroll, pinch or momentum) is ignored too (`TRACKPAD_TAP_GRACE_MS`). Scrolling closes an open menu.
- **⌘K command palette:** every part, model, tool, view and scene action.
- **Shortcuts:**
  - Tools: V/E/R/C/M, D measure, N annotate, A shapes. P opens the Pose tab.
  - Placement and view: F floor, S stack, Z zoom, 1–4 views.
  - Edit: ⌘Z / ⇧⌘Z, ⌘C / ⌘X / ⌘V, ⌘D, ⌫, ⌘A select all, ⌘G / ⇧⌘G group, Esc (closes draft → thread → comment mode → measurement → Measure tool → selection).
  - App: ⌘S Save Scene, ⌘F Find Parts, ⌘P Print (Lay Out Plates), ⌘, Settings, ⌘B / ⌘I panels, ? Settings → Shortcuts.
  - Scenes: ⌘T new, ⌘W close, ⇧⌘T reopen, ⌃Tab / ⇧⌘] next, ⌃⇧Tab / ⇧⌘[ previous, ⌘1–⌘9 (§5a).
  - **Copy, cut and paste** work on the clipboard events (the Edit menu's native roles, so text fields keep native editing). Copied parts live in memory, shared by every tab; the system clipboard holds only a marker type (`application/x-basecase-parts`), so ⌘V pastes parts only while nothing newer was copied, and a pasted image still becomes a reference plane. Pastes keep names, get new ids and groups, and drop `jointId`. In the same scene each paste steps 15 mm (like Duplicate); after a cut or in another scene the first paste lands in place. Cut reads “Cut ⟨name⟩ · Undo”.
  - Every new command gets a palette entry, and a tooltip shortcut when it has one.
