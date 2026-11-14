---
title: Keyboard shortcuts
date: 2026-11-13
updated: 2026-11-13
collection: get-started
type: reference
order: 1
keywords:
  - hotkeys
  - keys
  - key bindings
  - cheat sheet
  - ctrl
  - cmd
related:
  - trackpad-and-mouse-controls
  - run-a-command
covers:
  - electron/shortcuts.json
  - src/components/shortcutGroups.ts
  - src/components/ShortcutsList.tsx
  - src/workspace/useWorkspaceKeys.ts
  - src/components/tries/useTriesKeys.ts
  - src/app/tabShortcuts.ts
  - src/design-system/platformKeys.ts
  - src/components/agent/Composer.tsx
  - electron/app-menu.mjs
---

Every keyboard shortcut in Basecase is below, grouped by what you're doing, the same way as in the **Shortcuts** pane in Settings. To open the **Shortcuts** pane, press [[?]] when you're not typing.

## Navigate

| Action | Keys |
|---|---|
| Pan | Hold [[Space]] and drag |
| Zoom to selection | [[Z]] |
| Isometric view | [[1]] |
| Top view | [[2]] |
| Front view | [[3]] |
| Side view | [[4]] |

## Tools

| Action | Keys |
|---|---|
| Move | [[V]] or [[W]] |
| Rotate | [[E]] |
| Scale | [[R]] |
| Sculpt | [[C]] |
| Sculpt inverted | [[⌥]] and drag |
| Show pose | [[P]] |
| Comment | [[M]] |
| Measure | [[D]] |
| Measure without snapping | [[⇧]] and click |
| Measure vertically | [[⌥]] and click |
| Annotate | [[N]] |
| Marker while annotating | [[P]] |
| Eraser while annotating | [[E]] |
| Shapes | [[A]] |
| Drop to floor | [[F]] |
| Stack on part below | [[S]] |
| Move or rotate without snapping | [[⇧]] and drag |

**Note:** The two Sculpt shortcuts only work when **Sculpt** is turned on in **Settings** ▸ **Canvas**.

## Edit

| Action | Keys |
|---|---|
| Undo | [[⌘Z]] |
| Redo | [[⇧⌘Z]] or [[⌘Y]] |
| Add to selection | [[⇧]] and click |
| Box select | [[⇧]] and drag |
| Select a part inside a group | [[⌘]] and click, or double-click |
| Select all | [[⌘A]] |
| Copy | [[⌘C]] |
| Cut | [[⌘X]] |
| Paste | [[⌘V]] |
| Group | [[⌘G]] |
| Ungroup | [[⇧⌘G]] |
| Duplicate | [[⌘D]] |
| Delete | [[⌫]] |
| Deselect | [[Esc]] |

To leave the mode you're in, first clear anything smaller that's open inside it, then press [[Esc]]. Sketch and Import SVG stay open as long as they hold a drawing.

In [Tries](/help/open-a-try-from-any-scene), [[⌫]] deletes the selected tries after you confirm. While you're there, keys without [[⌘]] don't change the scene.

## Scenes

| Action | Keys |
|---|---|
| New scene | [[⌘T]] |
| Show scenes | [[⌘O]] |
| Close scene | [[⌘W]] |
| Reopen closed scene | [[⇧⌘T]] |
| Next scene | [[⌃Tab]], or [[⇧⌘]] and ] |
| Previous scene | [[⌃⇧Tab]], or [[⇧⌘]] and [ |
| Go to scenes 1 to 8 | [[⌘1]] to [[⌘8]] |
| Go to last scene | [[⌘9]] |

## App

| Action | Keys |
|---|---|
| Command menu | [[⌘K]] |
| Find parts | [[⌘F]] |
| Show or hide sidebar | [[⌘B]] |
| Show or hide inspector | [[⌘I]] |
| Show or hide reference images | [[⇧I]] |
| Show or hide camera views | [[⇧V]] |
| Print | [[⌘P]] |
| Run Routine | [[⌘↩]] |
| Settings | [[⌘,]] |
| Keyboard shortcuts | [[?]] |

While a Case is running, [[⌘Z]], [[⇧⌘Z]], and [[⌘Y]] only undo and redo changes to its code panels. [[⌘I]] shows or hides the **Agent** tab next to the running Case.

## Agent

These shortcuts work in the message field of the **Agent** tab.

| Action | Keys |
|---|---|
| Send | [[↩]] |
| New line | [[⇧↩]] |
| Queue | [[⌘↩]] |
| Stop | [[Esc]] |
| Slash commands | [[/]] |

- A queued message goes out as soon as the agent finishes what it's working on.
- To stop the agent with [[Esc]], clear the message field first.
- To open the slash commands, type a slash at the start of a message.

For trackpad and mouse controls, see [Trackpad and mouse controls](/help/trackpad-and-mouse-controls).
