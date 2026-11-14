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

You can keep up to 8 scenes open side by side as tabs and switch between them at any time. Each scene stays where you left it.

## Open a new scene

1. Click **+** after the last tab.

The new scene opens next to the current one, named Untitled. Or press [[⌘T]]. If you already have 8 tabs open, Basecase asks you to close one first.

## Rename a scene

1. Double-click the scene's tab.
2. Type the new name and press [[↩]].

To keep the old name, press [[Esc]]. Or choose **Rename** from the tab's right-click menu, or find **Rename Scene** in [[⌘K]].

![The command palette with Rename typed and Rename Scene highlighted](/help/open-rename-and-close-tabs/rename-scene.png)

## Close and reopen a scene

1. Hover the tab and click its **×**.
2. To bring it back, click **Undo** in the toast.

You can also press [[⌘W]] to close the front tab and [[⇧⌘T]] to reopen it. Basecase remembers the last 10 scenes you closed.

If the agent is working on a scene when you close it, the agent stops. A blank scene you never touched closes without saving, and you can't reopen it.

## Move between scenes

Press [[⌃Tab]] to go to the next tab and [[⌃⇧Tab]] to go to the previous one. To jump to a tab by its position, press [[⌘1]] to [[⌘8]]. Press [[⌘9]] to jump to the last tab.

Drag a tab to reorder it, or middle-click a tab to close it. Right-click a tab to find **Duplicate**, **Close Other Scenes** and **Close Scenes to the Right**.

To find a scene you've closed, see [Reopen a saved scene](/help/reopen-a-saved-scene).
