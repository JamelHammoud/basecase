---
title: Arrange a Case's console
date: 2026-11-14
collection: simulate-and-train
type: task
order: 5
keywords:
  - console
  - panels
  - layout
  - plot
  - resize
  - drag
  - columns
related:
  - run-a-case
  - build-a-case-app-with-the-agent
covers:
  - src/cases/console/consoleEdits.ts
  - src/workspace/useConsoleEditing.ts
  - src/components/caseRun/
  - src/workspace/caseCommands.tsx
---

Move, resize, add, rename and delete the panels around a running Case, and the Case keeps your layout.

1. Run a Case. See [Run a Case](/help/run-a-case).
2. To move a panel, drag it by its title, or by its top edge when it has no title. A blue line shows where it will land.
3. To start a new card, drop the panel at the side of a card or at the side of the canvas.

![The Reach plot dragged from the right card toward the left one, with a blue line under the brief where it will land](/help/arrange-a-case-console/move.png)

4. To make a card wider or narrower, drag the gap between it and the canvas.
5. To add a panel, right-click a card and choose **Add Panel**. Choose a kind, then the signal or setting it shows.

6. To rename a panel, right-click it, choose **Rename**, type the name and press [[↩]].
7. To delete a panel, right-click it, choose **Delete**, then click **Delete**.

You can also press [[⌘K]] and choose **Add Panel**, which adds the panel to the last card on the right.

Each change is one step that [[⌘Z]] undoes while the Case runs. Basecase saves the layout with the Case in your `.basecase` file, and a robot you share as a link opens with it. A Case without its own console starts from a copy of the default layout on your first change.

A card is 200 to 720 pixels wide. A console holds six cards at most, the canvas included, and 24 panels. If a change would break the layout, Basecase keeps the layout as it was and shows why.

You can arrange the console during a try, and the try keeps going. While a try plays back, and in a robot shared in the browser, the console can't be changed.

The agent reads your layout when it reads the scene, so it builds on what you arranged. Code panels, such as a joystick or a piano, come from the agent. See [Build a Case app with the agent](/help/build-a-case-app-with-the-agent).
