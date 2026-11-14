---
title: Open, rename and close scene tabs
date: 2026-11-13
updated: 2026-11-13
collection: files-and-sharing
type: task
order: 2
keywords:
  - tabs
  - new scene
  - close scene
  - reopen closed tab
  - switch scenes
  - rename
related:
  - reopen-a-saved-scene
  - keyboard-shortcuts
covers:
  - src/components/SceneTabs.tsx
  - src/components/sceneTabs/SceneTab.tsx
  - src/components/sceneTabs/tabMenu.tsx
  - src/app/tabModel.ts
  - src/app/useTabs.ts
  - src/app/useTabActions.ts
  - src/app/tabShortcuts.ts
  - src/workspace/fileCommands.tsx
---

Keep up to 8 scenes open side by side as tabs, and move between them without losing your place.

## Open a new scene

1. Click **+** after the last tab.

The new scene opens next to the current one, named Untitled. You can also press [[⌘T]]. With 8 tabs open, Basecase asks you to close one first.

## Rename a scene

1. Double-click the scene's tab.
2. Type the new name and press Enter.

Press Esc to keep the old name. **Rename** is also in the tab's right-click menu, and **Rename Scene** is in [[⌘K]].

![The command palette with Rename typed and Rename Scene highlighted](/help/open-rename-and-close-tabs/rename-scene.png)

## Close and reopen a scene

1. Hover the tab and click its **×**.
2. To bring it back, click **Undo** in the toast.

You can also press [[⌘W]] to close the front tab, and [[⇧⌘T]] to reopen it. Basecase remembers the last 10 scenes you closed. Closing a scene while the agent works on it stops the agent. A blank scene you never touched closes without saving and can't be reopened.

## Move between scenes

Press [[⌃Tab]] for the next tab and [[⌃⇧Tab]] for the previous one. [[⌘1]] to [[⌘8]] jump to a tab by position, and [[⌘9]] to the last.

Drag a tab to reorder it, or middle-click it to close it. Right-click a tab for **Duplicate**, **Close Other Scenes** and **Close Scenes to the Right**.

To find a scene you've closed, see [Reopen a saved scene](/help/reopen-a-saved-scene).
