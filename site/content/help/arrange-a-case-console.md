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
  - src/components/caseRun/
  - src/workspace/useConsoleEditor.ts
  - src/workspace/CaseRunProvider.tsx
  - src/workspace/caseCommands.tsx
---

Move, resize, add and delete the panels around a running Case, and the Case keeps that layout every time it runs.

1. Open the Case, press [[⌘K]] and choose **Run Case**.
2. Drag a panel by its title to another place in its column or to another column. A panel without a title drags by its top edge. A blue line shows where it will land.

![The plot dragged over the left column, with a blue line under the Scene camera where it will land](/help/arrange-a-case-console/drag.png)

3. To start a new column, drop the panel along the left or right edge of a column. A console holds up to six columns, counting the canvas.
4. To resize a column, drag the gap between it and the canvas. A column is 200 to 720 pixels wide.

![The plot in the left column during a try, with the right column wider](/help/arrange-a-case-console/arranged.png)

5. Right-click a column and choose **Add Panel**.
6. Choose a kind, then choose what it shows, and click **Add Panel**. A value shows one number, and a plot shows up to eight signals, such as `joint.*.position` for every joint's angle.

![Add Panel with Plot chosen and joint.*.position checked](/help/arrange-a-case-console/add-panel.png)

7. To rename or delete a panel, right-click it and choose **Rename** or **Delete**. Basecase asks before it deletes a panel.

![A panel's menu with Add Panel, Rename and Delete](/help/arrange-a-case-console/menu.png)

You can also press [[⌘K]] and choose **Add Panel**, which adds the panel to the column right of the canvas.

Each change is one undo step, so [[⌘Z]] puts the last one back while the Case runs. Editing never stops a try that's running.

The layout is saved in the Case. It's in your `.basecase` file and in a link you make with **Share Robot**. A Case that had no layout of its own gets one the first time you change it.

The agent reads the layout you made, so when you ask it to change the Case, it keeps your panels where you put them. Code panels are the agent's to write. See [Build a Case app with the agent](/help/build-a-case-app-with-the-agent).
