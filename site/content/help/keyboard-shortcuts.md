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
  - src/components/simulate/useTimelineKeys.ts
  - src/app/tabShortcuts.ts
  - src/design-system/platformKeys.ts
  - src/components/agent/Composer.tsx
  - electron/app-menu.mjs
---

Every keyboard shortcut in Basecase, grouped by what you're doing, as the **Shortcuts** pane in Settings lists them.

Press [[?]] while you're not typing to open the **Shortcuts** pane.

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

The two Sculpt keys work once **Sculpt** is on in **Settings** ▸ **Canvas**.

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

[[Esc]] also leaves whichever mode is open, once anything smaller in it has cleared. Sketch and Import SVG stay open while they hold a drawing.

In [Tries](/help/open-a-try-from-any-scene), [[⌫]] deletes the selected tries once you confirm. Keys without [[⌘]] leave the scene alone there.

While a try's timeline is open, [[S]] splits the segment under the playhead and [[⌫]] merges the selected segment into the one before. With no segment selected, [[⌫]] still deletes the selected tries. [[⌘Z]] and [[⇧⌘Z]] undo and redo those edits. [Label the segments of a try](/help/label-the-segments-of-a-try) has the rest.

## Scenes

| Action | Keys |
|---|---|
| New scene | [[⌘T]] |
| Show scenes | [[⌘O]] |
| Close scene | [[⌘W]] |
| Reopen closed scene | [[⇧⌘T]] |
| Next scene | [[⌃Tab]], or [[⇧⌘]] and ] |
| Previous scene | [[⌃⇧Tab]], or [[⇧⌘]] and [ |
| Go to scene 1–8 | [[⌘1]] to [[⌘8]] |
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

While a Case runs, [[⌘Z]], [[⇧⌘Z]] and [[⌘Y]] undo and redo only changes to its code panels. [[⌘I]] shows or hides the **Agent** tab beside it.

## Agent

These keys work in the message field of the **Agent** tab.

| Action | Keys |
|---|---|
| Send | [[↩]] |
| New line | [[⇧↩]] |
| Queue | [[⌘↩]] |
| Stop | [[Esc]] |
| Slash commands | [[/]] |

Queue sends the message once the agent finishes its current work. [[Esc]] stops the agent only while the message field is empty. A slash at the start of a message opens the slash commands.

For the trackpad and mouse, see [Trackpad and mouse controls](/help/trackpad-and-mouse-controls).
