---
title: Run a Case
date: 2026-11-13
updated: 2026-11-13
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
related:
  - try-a-case
  - make-a-case
  - share-a-robot-as-a-link
covers:
  - src/cases/console/
  - src/sim/inputSources.ts
  - src/workspace/useCaseRun.ts
  - src/workspace/useConsoleSignals.ts
  - src/workspace/CaseRunProvider.tsx
  - src/components/caseRun/
  - src/components/simulate/CaseSections.tsx
  - src/workspace/caseCommands.tsx
  - src/workspace/agentCaseRequests.ts
---

Run a Case in the whole window, laid out the way the Case asks: the robot on the canvas, and around it the cameras, numbers, plots, buttons and tries it needs.

1. Open a Case. Pick one under Play ▸ Cases, or make one with **New Case**. It opens in the Simulate tab.
2. Click the expand button in the Case's header, or press [[⌘K]] and choose **Run Case**.

![The Simulate tab with Touch the Dots open and the Run Case tooltip on its expand button](/help/run-a-case/brief.png)

3. Look at the cards around the canvas. A Case without its own layout shows its cameras on the left: the Scene view, or your stationary camera views, then one tile for each camera on the robot. On the right are the brief, the emulated robot and your tries. Click a camera tile to draw it sharper, right-click it for Look Through, Rename and Lens.

![The Case running with the cameras on the left, the arm in the middle and the brief, Connect Emulated Robot and Try It on the right](/help/run-a-case/center.png)

4. In the desktop app, click **Connect Emulated Robot**. You see the servo count and whether the motors run, with Stop while they do. Below are the newest message from the daemon and each servo's angle and temperature.

![Three emulated servos connected, motors off, each reading its angle](/help/run-a-case/connected.png)

5. Click **Try It** and drive with W A S D and Q E, or a gamepad. While the try runs, anything the Case counts as a failure shows in red under the brief as it happens.

![A try running, with the clock and Stop Try](/help/run-a-case/trying.png)

6. Click **Stop Try**, or let the clock run out. The try joins Results, with Replay, Export Dataset and Publish to Hugging Face once one passes. Train from Tries joins them once five pass.

![Results with the recorded try](/help/run-a-case/tries.png)

7. Click **Done** or press Esc to go back. The first Esc stops driving. Your parts, selection and camera are as you left them.

A Case can bring its own layout, called its console, saved with the Case in your `.basecase` file. Ask the agent for a Case in words and it writes one, or edit that file. New Case and the templates make Cases without one.

A console says which inputs drive the Case, which cards sit on which side of the canvas and how wide, and what's in them: a camera, a big number such as a timer or a score, a plot of joint angles over time, a table of joints, a button such as Reset, the tries, the failures, some text, or a map of the world from above. A game Case, for example, can put its time and score on the left and Try It, Reset and the tries on the right; the time counts down while you play, and between tries Reset puts the robot, the blocks and the score back.

A console that lists `camera` among its inputs opens the computer's camera when you click **Try It**. Your arms then drive a humanoid or an arm, as in [Drive a robot with your camera](/help/drive-a-robot-with-your-camera).

![A block game console during a try: Time counting down and Score on the left, the arm in the middle, Try It, Reset and the running try on the right](/help/run-a-case/console.png)

A console can also hold the Case's own code: up to 4 panels, each a small web page, in a column or over the canvas. One can draw a joystick that drives the robot, another a readout of its speed over the canvas. Esc, [[⌘K]], [[⌘Z]] and [[⌘I]] still work while you use it, and [[⌘I]] shows the **Agent** tab beside the Case. There, [[⌘Z]] undoes only changes to the code panels, so the robot stays as it is. A panel over the canvas lets your clicks through to the robot unless it's made to take them.

![A rover Case running with a joystick in the right column and its speed and tilt over the canvas](/help/run-a-case/code.png)

A code panel closes when it stops answering for 2 seconds, or doesn't start within 10 seconds. In its place you see “Couldn’t run” with the panel's name and “It didn’t answer.” A panel whose script fails while it loads shows its error there instead.

The agent can write these panels and change them while the Case runs. [Build a Case app with the agent](/help/build-a-case-app-with-the-agent) has the steps.

A link made with **Share Robot** opens the same console in the browser, as in [Share a robot as a link](/help/share-a-robot-as-a-link). Camera panels, the servos table and the tries stay in the studio.

Picking a view in the rail also takes you back, and so does any [[⌘K]] command other than driving, trying, **Multiply** and the dataset ones.
