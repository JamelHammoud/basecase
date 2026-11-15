---
title: Run a Case
date: 2026-11-13
collection: simulate-and-train
type: task
order: 5
keywords:
  - console
  - panels
  - layout
  - teleop
  - camera feed
  - score
  - timer
  - code panel
  - joystick
  - HUD
  - movable
related:
  - try-a-case
  - make-a-case
  - play-a-try-through-its-console
  - arrange-a-case-console
  - share-a-robot-as-a-link
covers:
  - src/cases/console/
  - src/cases/worldSet.ts
  - src/sim/worldMoves.ts
  - src/sim/inputSources.ts
  - src/workspace/useCaseRun.ts
  - src/workspace/useConsoleSignals.ts
  - src/workspace/CaseRunProvider.tsx
  - src/components/caseRun/
  - src/components/simulate/CaseSections.tsx
  - src/workspace/caseCommands.tsx
  - src/workspace/agentCaseRequests.ts
hub_sort: order
---

You can run a Case in the whole window, with the layout the Case asks for. The robot sits on the canvas, with the cameras, numbers, plots, buttons and tries the Case needs around it.

1. Open a Case. Pick one under **Play** ▸ **Cases**, or make one with **New Case**. The Case opens in the Simulate tab.
2. Click the expand button in the Case's header. Or press [[⌘K]] and choose **Run Case**.

![The Simulate tab with Touch the Dots open and the Run Case tooltip on its expand button](/help/run-a-case/brief.png)

3. Look at the cards around the canvas. If the Case doesn't have its own layout, its cameras sit on the left: first the Scene view or your stationary camera views, then one tile for each camera on the robot. The brief, the emulated robot and your tries sit on the right.
   - To show a camera tile in sharper detail, click it.
   - To choose **Look Through**, right-click a simulated camera tile. Camera parts and stationary views also offer **Rename** and **Lens**. Recorded camera tiles have no right-click menu.

![The Case running with the cameras on the left, the arm in the middle and the brief, Connect Emulated Robot and Try It on the right](/help/run-a-case/center.png)

4. In the desktop app, click **Connect Emulated Robot**. The card shows the number of servos and whether the motors are running. While they run, you see Stop. Below that are the daemon's newest message and each servo's angle and temperature.

![Three emulated servos connected, motors off, each reading its angle](/help/run-a-case/connected.png)

5. Click **Try It**, then drive with [[W A S D]], [[Q]] and [[E]], or with a gamepad. If the Case counts something as a failure, the failure appears in red under the brief as soon as it happens.

![A try running, with the clock and Stop Try](/help/run-a-case/trying.png)

6. Click **Stop Try**, or let the clock run out. The try appears in Results. To play it back through the cards, click its row. See [Play a try through its console](/help/play-a-try-through-its-console). After a try passes, you can choose **Make Dataset** in Results, then export, publish and train from the dataset. See [Make a dataset from tries](/help/make-a-dataset-from-tries).

![Results with the recorded try](/help/run-a-case/tries.png)

7. Click **Done** or press [[Esc]] to go back. The first [[Esc]] stops driving. Your parts, selection and camera stay as you left them.

You can also go back by picking a view in the rail, or by running any [[⌘K]] command except driving, trying, **Add Panel**, **Multiply** and the dataset commands.

{{help-hub}}
