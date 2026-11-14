---
title: Arrange a Case's console
date: 2026-11-14
collection: simulate-and-train
type: task
order: 6
keywords:
  - console
  - panels
  - layout
  - plot
  - resize
  - drag
  - columns
  - dashboard
  - Foxglove
related:
  - run-a-case
  - build-a-case-app-with-the-agent
covers:
  - src/cases/console/layoutEdits.ts
  - src/cases/console/panelChoices.ts
  - src/cases/console/panelNames.ts
  - src/components/caseRun/
  - src/workspace/useConsoleEditor.ts
  - src/workspace/CaseRunProvider.tsx
  - src/workspace/caseCommands.tsx
---

You can move, resize, add and delete the panels around a running Case.

1. Open the Case, then press [[⌘K]] and choose **Run Case**.
2. Drag a panel by its title to a new place in the same column or to a different column. If a panel has no title, drag it by its top edge. A blue line shows where the panel will go.

![The plot dragged over the left column, with a blue line under the Scene camera where it will land](/help/arrange-a-case-console/drag.png)

3. To start a new column, drop the panel along the left or right edge of a column. A console can have up to six columns, including the canvas.
4. To resize a column, drag the gap between it and the canvas. A column can be 200 to 720 pixels wide.

![The plot in the left column during a try, with the right column wider](/help/arrange-a-case-console/arranged.png)

5. Right-click a column, then choose **Add Panel**.
6. Choose a kind of panel and what it shows, then click **Add Panel**. A value shows a single number, and a plot shows up to eight signals. For example, `joint.*.position` plots the angle of every joint.

![Add Panel with Plot chosen and joint.*.position checked](/help/arrange-a-case-console/add-panel.png)

7. To rename or delete a panel, right-click it, then choose **Rename** or **Delete**. Basecase asks you to confirm before it deletes a panel.

![A panel's menu with Add Panel, Rename and Delete](/help/arrange-a-case-console/menu.png)

You can also press [[⌘K]] and choose **Add Panel**. The new panel goes in the column to the right of the canvas.

**Note:** A console can hold up to 24 panels, and a single column can hold up to 12.

Each change is one undo step. To undo your last change while the Case is running, press [[⌘Z]]. Editing the console doesn't stop a try that's in progress.

Basecase saves your layout in the Case and uses it for every run. The layout is included in your `.basecase` file and in any link you make with **Share Robot**. If a Case has no layout of its own, it gets one the first time you change it.

When the agent changes the Case, it reads your layout and also writes code panels. Learn more in [Build a Case app with the agent](/help/build-a-case-app-with-the-agent).
