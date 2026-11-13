---
title: Get a robot ready to build
date: 2026-11-12
updated: 2026-11-13
collection: build-and-print
type: task
order: 1
popular: true
keywords:
  - build tab
  - checks
  - blockers
  - ready
  - fix
related:
  - from-design-to-build
  - build-checks
  - troubleshoot-build-check-blocks-ready-to-build
  - price-the-parts-and-set-a-budget
covers:
  - src/components/BuildPanel.tsx
  - src/components/build/ChecksSection.tsx
  - src/components/build/CheckItem.tsx
  - src/components/build/FindingRow.tsx
  - src/components/build/IgnoredChecks.tsx
  - src/components/build/TetherFields.tsx
  - src/workspace/RightPanelTabs.tsx
  - src/workspace/viewCommands.tsx
  - src/workspace/sceneCommands.tsx
---

Clear every problem the Build tab finds, so the design can be printed, bought and put together.

1. Click **Build** at the top of the right panel.
2. Read the header of **Checks**. It says **Ready to build**, or how many problems are left, such as **3 to fix**.
3. Click a check with a red mark to open it.
4. Click a part name under a problem to select that part on the canvas.
5. Click **Fix** to hand the problem to the agent, or change the part yourself. On **Strength**, **Fix** prints the part on its strongest face instead.
6. If the robot runs on a cable instead of a battery, open **Servo voltage** and type the supply's volts in **V**.
7. Open **Supply current** and type the supply's amps in **A**.
8. Wait for the header to read **Ready to build**. The checks run again on their own after every change.

![The Build tab with every check passed and a $150 budget beside the total](/help/get-a-robot-ready-to-build/build-tab.png)

**Open Build** and **Run Checks** are also in ⌘K.

To set a problem aside, click ⋯ on its row and choose **Ignore**. The **Ignore All** item below it, named after the kind of problem, sets aside every problem of that kind. Ignored problems stay under **Ignored**, where **Restore** brings each one back.

Why each check exists is in [The path from design to build](/help/from-design-to-build). Next, [price the parts and set a budget](/help/price-the-parts-and-set-a-budget).
