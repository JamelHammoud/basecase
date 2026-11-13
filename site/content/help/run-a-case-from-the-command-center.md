---
title: Run a Case from the Command Center
date: 2026-11-13
covers:
  - src/cases/console.ts
  - src/workspace/useCommandCenter.ts
  - src/workspace/useTryGoal.ts
  - src/components/commandCenter/
  - src/workspace/caseCommands.tsx
---

Run a Case in one window: the robot on the canvas, its cameras beside it, the emulated servos and your tries next to them.

1. Open a Case. Pick one under Play ▸ Cases, or make one with **New Case**. It opens in the Simulate tab.
2. Click the expand button in the Brief's header, or press ⌘K and choose **Open Command Center**.

![The Simulate tab with the Brief and its Open Command Center button](/help/run-a-case-from-the-command-center/brief.png)

3. Look at the cameras on the left: the Scene view, or your stationary camera views, then one tile for each camera on the robot. Click a tile to draw it sharper, right-click it for Look Through, Rename and Lens.

![The Command Center with the cameras on the left, the arm in the middle and the Brief, Connect Emulated Robot and Try It on the right](/help/run-a-case-from-the-command-center/center.png)

4. In the desktop app, click **Connect Emulated Robot** on the right. You see the Ladder's current rung, Stop while the motors run, the newest message from the daemon, and each servo's angle and temperature under Emulated servos.

![Emulated servos connected, with the rung Look and three servos reading their angles](/help/run-a-case-from-the-command-center/connected.png)

5. Click **Try It** and drive with W A S D and Q E, or a gamepad. While the try runs, anything the Case counts as a failure shows in red under the brief as it happens.

![A try running, with the clock and End Try](/help/run-a-case-from-the-command-center/trying.png)

6. Click **End Try**, or let the clock run out. The try joins Results under it, with Replay, Export Dataset and Publish to Hugging Face once one passes.

![Results with the recorded try](/help/run-a-case-from-the-command-center/tries.png)

7. Click **Done** or press Esc to go back. The first Esc stops driving. Your parts, selection and camera are as you left them.

Picking a view in the rail also takes you back, and so does any ⌘K command other than driving, trying and the dataset ones. A Case file can list the panels it opens with and whether it's driven with keys or a gamepad; one that doesn't opens all of them, with keys.
