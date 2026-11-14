---
title: Run any command from the keyboard
date: 2026-11-13
updated: 2026-11-13
collection: get-started
type: task
order: 3
keywords:
  - command palette
  - cmd k
  - ctrl k
  - search commands
  - quick open
related:
  - the-basecase-window
  - keyboard-shortcuts
covers:
  - src/components/CommandPalette.tsx
  - src/workspace/WorkspacePalette.tsx
  - src/workspace/sceneCommands.tsx
  - src/workspace/editCommands.tsx
  - src/workspace/viewCommands.tsx
  - src/workspace/selectionNeeds.ts
  - src/workspace/partActions.tsx
---

With [[⌘K]], you can find any command, catalog part or saved model by typing its name, instead of looking for it in the menus.

1. Press [[⌘K]].
2. Type a few letters of what you want, such as `servo` or `top view`.
3. Press [[↑]] or [[↓]] to pick a result.
4. Press [[↩]].

Every word you type must match. Results whose names start with your words appear first. If a result has a shortcut, it shows on the right, so next time you can press the shortcut instead.

The command menu includes the commands from every menu, each catalog part and hardware size, your Library models, and your other open scenes. Saved scenes aren't listed. To open one, use **Show Scenes** ([[⌘O]]).

A command appears only when it can run. For example, **Copy** and **Delete** need a selected part. **Hide** and **Lock** need exactly one, **Group** and **Union** need two, and **Spread Along X** needs three. While the simulation is on, **Simulate** changes to **Stop Simulation**.

To close the command menu, press [[Esc]]. You can also open it from **View** ▸ **Command Menu**. For a list of the keys themselves, see [Keyboard shortcuts](/help/keyboard-shortcuts).
