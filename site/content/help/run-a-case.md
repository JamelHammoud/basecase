---
title: Run a Case
date: 2026-11-13
updated: 2026-11-14
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
---

You can run a Case in the whole window, with a layout made for that Case. The robot sits on the canvas, with the cameras, numbers, plots, buttons and tries the Case needs around it.

1. Open a Case. Pick one under **Play** ▸ **Cases**, or create one with **New Case**. The Case opens in the Simulate tab.
2. Click the expand button in the Case's header. Or press [[⌘K]] and choose **Run Case**.

![The Simulate tab with Touch the Dots open and the Run Case tooltip on its expand button](/help/run-a-case/brief.png)

3. Look at the cards around the canvas. If the Case doesn't have its own layout, its cameras are on the left: first the Scene view or your stationary camera views, then one tile for each camera on the robot. The brief, the emulated robot and your tries are on the right. To draw a camera tile sharper, click it. To choose Look Through, Rename or Lens, right-click it.

![The Case running with the cameras on the left, the arm in the middle and the brief, Connect Emulated Robot and Try It on the right](/help/run-a-case/center.png)

4. In the desktop app, click **Connect Emulated Robot**. You see how many servos there are and whether the motors are running. While the motors run, Stop appears too. Below that are the daemon's newest message and the angle and temperature of each servo.

![Three emulated servos connected, motors off, each reading its angle](/help/run-a-case/connected.png)

5. Click **Try It**, then drive with [[W A S D]], [[Q]] and [[E]], or with a gamepad. If the Case counts something as a failure, it shows in red under the brief as it happens.

![A try running, with the clock and Stop Try](/help/run-a-case/trying.png)

6. To end the try, click **Stop Try** or let the clock run out. The try appears in Results, with Replay. Once a try passes, you can choose Make Dataset in Results to export, publish or train on your tries. See [Make a dataset from tries](/help/make-a-dataset-from-tries).

![Results with the recorded try](/help/run-a-case/tries.png)

7. To go back, click **Done** or press [[Esc]]. The first [[Esc]] stops driving. Your parts, selection and camera are the way you left them.

You can also go back by picking a view in the rail, or by running any [[⌘K]] command except driving, trying, **Multiply** and the dataset commands.

A Case can have its own layout, called its console. Basecase saves the console with the Case in your `.basecase` file. To get one, describe the Case you want to the agent and it writes the console for you. Or edit the `.basecase` file yourself. Cases you make with New Case or from a template don't have a console.

A console lists which inputs drive the Case, which cards go on each side of the canvas, how wide those cards are and what each card holds. A card can hold any of these:

- A camera
- A big number, such as a timer or a score
- A plot of joint angles over time
- A table of joints
- A button, such as Reset
- The tries
- The failures
- Some text
- A map of the world from above

For example, a game Case can put its time and score on the left, and Try It, Reset and the tries on the right. The time counts down while you play. Between tries, Reset puts the robot, the blocks and the score back the way they started.

If a console lists `camera` among its inputs, **Try It** opens your computer's camera, and your arms drive a humanoid or an arm. See [Drive a robot with your camera](/help/drive-a-robot-with-your-camera). The Case's logic receives the gestures you make, and the Case can set a button to press when you make one. [Teach a robot a gesture](/help/teach-a-robot-a-gesture) explains how. A console can also list `hand`, `face`, `midi` and `voice`, which [Drive a Case with your hand, face, MIDI or voice](/help/drive-a-case-with-your-hand-face-midi-or-voice) covers.

![A block game console during a try: Time counting down and Score on the left, the arm in the middle, Try It, Reset and the running try on the right](/help/run-a-case/console.png)

A console can hold the Case's own code in up to 4 panels. Each panel is a small web page that sits in a column or over the canvas. For example, one panel might draw a joystick that drives the robot, and another might show the robot's speed over the canvas.

[[Esc]] and [[⌘K]] still work inside a panel. While a Case runs, **Undo** at the top right undoes changes to the code panels without changing the robot. Outside a panel or a text field, [[⌘Z]] does the same, and [[⌘I]] shows the **Agent** tab beside the Case. Clicks on a panel over the canvas go through to the robot, unless the panel uses them.

![A rover Case running with a joystick in the right column and its speed and tilt over the canvas](/help/run-a-case/code.png)

Code panels can change the Case's world during a run. They can move, light or hide any object the Case marks as movable, such as a target that pops up or a wall that opens. To make an object movable, tell the agent which object should move when it makes the Case. Basecase records each change in the try, so a replay shows the same world.

A panel can watch the Scene view, a camera view you placed, or one of the robot's cameras, at up to 640 × 480 and 15 frames per second, but not your computer's camera.

To remember something like a high score, a panel can keep a value of up to 64 KB on this computer. The value stays after **Reset** and after you reopen the scene. Deleting the Case or the scene removes it. The value isn't part of the Case, so a Case that you share, open somewhere else or copy with **Duplicate Scene** starts without it.

![A rover Case running, with a code panel showing the Scene camera and the target its code moved and lit red](/help/run-a-case/world.png)

If a code panel stops answering for 2 seconds, or doesn't start within 10 seconds, it closes. In its place, you see “Couldn’t run” with the panel's name and “It didn’t answer.” If the panel's script fails while it loads, you see its error there instead. If any other panel fails, it shows its title and “stopped working” with **Reload**, while the robot and the try keep going.

The agent can write these panels and change them during a run. To learn how, see [Build a Case app with the agent](/help/build-a-case-app-with-the-agent).

A link you make with **Share Robot** opens the same console in the browser. Camera panels, the servos table and the tries stay in the studio. In the browser, code panels don't get camera frames and don't keep values. See [Share a robot as a link](/help/share-a-robot-as-a-link).
