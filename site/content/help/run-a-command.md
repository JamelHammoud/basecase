---
title: Run any command from the keyboard
date: 2026-11-13
updated: 2026-11-14
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

Press [[⌘K]] to open the command menu. Type a name to find a command, a catalog part or a saved model.

1. Press [[⌘K]].
2. Type a few letters of what you want, such as `servo` or `top view`.
3. Press [[↑]] or [[↓]] to choose a result.
4. Press [[↩]].

You can also open the command menu by choosing **View** ▸ **Command Menu**. To close it, press [[Esc]].

A result only appears if every word you type matches it. Results whose names start with your words are listed first. If a result has a keyboard shortcut, it's shown on the right. Next time, you can press the shortcut instead.

The command menu lists the commands from every menu, each catalog part and hardware size, your Library models, and your other open scenes. Saved scenes aren't listed. To open a saved scene, use **Show Scenes** ([[⌘O]]).

A command only appears when it can run. For example:

- **Copy** and **Delete** need a selected part.
- **Hide** and **Lock** need exactly one selected part.
- **Group** and **Union** need two selected parts.
- **Spread Along X** needs three selected parts.
- **Add Clearance Hole** needs a screw, standoff or other piece of hardware that makes a hole.
- **Export STL** needs a visible Solid part.

While the simulation is on, **Simulate** changes to **Stop Simulation**.

For a list of keyboard shortcuts, see [Keyboard shortcuts](/help/keyboard-shortcuts).
