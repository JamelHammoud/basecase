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

Search every command, catalog part and saved model by name with [[⌘K]], without hunting through menus.

1. Press [[⌘K]].
2. Type a few letters of what you want, such as `servo` or `top view`.
3. Press [[↑]] or [[↓]] to pick a result.
4. Press [[↩]].

Every word you type must match, and results whose name starts with your words come first. A result's shortcut shows at its right, so the next time you can press it directly.

The command menu holds the commands from every menu, each catalog part and hardware size, your Library models, and your other open scenes. It doesn't list saved scenes; **Show Scenes** ([[⌘O]]) opens them.

Commands that act on parts are listed only while they can run. **Copy** and **Delete** need a selected part, **Hide** and **Lock** exactly one, **Group** and **Union** two, and **Spread Along X** three.

Press [[Esc]] to close it. It's also **View** ▸ **Command Menu**. For the keys themselves, see [Keyboard shortcuts](/help/keyboard-shortcuts).
