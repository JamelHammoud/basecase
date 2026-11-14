---
title: Arrange a Case's console
date: 2026-11-13
collection: simulate-and-train
type: task
order: 6
keywords:
  - console
  - layout
  - panels
  - move
  - resize
  - add panel
  - plot
  - column
related:
  - run-a-case
  - build-a-case-app-with-the-agent
covers:
  - src/cases/console/consoleEdits.ts
  - src/components/caseRun/CaseRunArea.tsx
  - src/components/caseRun/ConsolePanel.tsx
  - src/components/caseRun/edit/
  - src/workspace/useConsoleEditor.ts
  - src/workspace/caseCommands.tsx
---

Move, resize, add, rename and delete the panels around a running Case, and keep the layout in the Case.

1. Run the Case, as in [Run a Case](/help/run-a-case).
2. Drag a panel by its title to where you want it. A blue line shows where it lands. A panel without a title moves by its top edge.

![The Time panel dragged from the left column, with a blue line under Try It in the right column](/help/arrange-a-case-console/move.png)

3. To start a new column, drop a panel on the left or right edge of a column.
4. Drag the gap on the canvas side of a column to make it wider or narrower.
5. Right-click a column, choose **Add Panel**, then a kind, such as **Plot**.
6. Choose what it shows, such as `joint.*.position` for every joint's angle.
7. Right-click a panel and choose **Rename** to give it a title, or **Delete** to remove it once you confirm.

![The right-click menu on the Score panel, with Rename, Delete and Add Panel, and Time moved under Try It](/help/arrange-a-case-console/menu.png)

You can also press [[⌘K]] and choose **Add Panel**. The panel goes to the column right of the canvas.

![The arranged console during a try: Score and a joint.*.position plot on the left, the buttons, the try and Time on the right](/help/arrange-a-case-console/arranged.png)

Each change is one step, so [[⌘Z]] takes it back. Changing the layout doesn't stop a try. The layout is saved with the Case in your `.basecase` file, and a link made with **Share Robot** shows it.

A column is 200 to 720 pixels wide. The canvas and the columns make at most 6, a column holds at most 12 panels, and a console at most 24. At a limit, **Add Panel** is grayed out, and no blue line shows where a panel can't go.

A Case without its own console starts from the default one the first time you change it. Code panels come from the agent, as in [Build a Case app with the agent](/help/build-a-case-app-with-the-agent). The agent reads your layout, so a change you ask for keeps it.
