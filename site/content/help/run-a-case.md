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

You can run a Case in the whole window, using the layout the Case asks for. The robot stays on the canvas, with the cameras, numbers, plots, buttons and tries the Case needs around it.

1. Open a Case. Choose one in **Play** ▸ **Cases**, or create one with **New Case**. The Case opens in the Simulate tab.
2. Click the expand button in the Case's header, or press [[⌘K]] and choose **Run Case**.

![The Simulate tab with Touch the Dots open and the Run Case tooltip on its expand button](/help/run-a-case/brief.png)

3. Look at the cards around the canvas. If the Case doesn't have its own layout, the cameras are on the left: first the Scene view or your stationary camera views, then a tile for each camera on the robot. The brief, the emulated robot and your tries are on the right. To draw a camera tile sharper, click it. To choose Look Through, Rename or Lens, right-click it.

![The Case running with the cameras on the left, the arm in the middle and the brief, Connect Emulated Robot and Try It on the right](/help/run-a-case/center.png)

4. In the desktop app, click **Connect Emulated Robot**. You see the number of servos and whether the motors are running, and Stop while they run. Below that are the daemon's newest message and each servo's angle and temperature.

![Three emulated servos connected, motors off, each reading its angle](/help/run-a-case/connected.png)

5. Click **Try It**, then drive with [[W A S D]], [[Q]] and [[E]], or with a gamepad. Anything the Case counts as a failure shows in red under the brief as soon as it happens.

![A try running, with the clock and Stop Try](/help/run-a-case/trying.png)

6. Click **Stop Try**, or wait for the clock to run out. The try appears in Results. Once a try passes, you can choose Replay, Export Dataset or Publish to Hugging Face in Results. After five passing tries, you can also choose Train from Tries.

![Results with the recorded try](/help/run-a-case/tries.png)

7. To go back, click **Done** or press [[Esc]]. The first [[Esc]] stops driving. Your parts, selection and camera are as you left them.

You can also leave by choosing a view in the rail, or by running any [[⌘K]] command except driving, trying, **Multiply** and the dataset commands.

## Cases with their own layout

A Case can bring its own layout, called its console. Basecase saves the console with the Case in your `.basecase` file. To get a console, describe the Case you want to the agent, and it writes the console for you. You can also edit that file yourself. Cases you make with New Case or from a template have no console.

A console lists the inputs that drive the Case, the cards on each side of the canvas, and each card's width and contents. A card can hold any of these:

- A camera
- A big number, such as a timer or a score
- A plot of joint angles over time
- A table of joints
- A button, such as Reset
- The tries
- The failures
- Some text
- A map of the world from above

For example, a game Case can show its time and score on the left, with Try It, Reset and the tries on the right. The time counts down while you play, and Reset between tries puts the robot, the blocks and the score back.

![A block game console during a try: Time counting down and Score on the left, the arm in the middle, Try It, Reset and the running try on the right](/help/run-a-case/console.png)

If a console lists `camera` among its inputs, **Try It** opens your computer's camera and your arms drive a humanoid or an arm, as in [Drive a robot with your camera](/help/drive-a-robot-with-your-camera). The Case's logic receives the gestures you make, and the Case can set a button to press when you make one, as in [Teach a robot a gesture](/help/teach-a-robot-a-gesture). A console can also list `hand`, `face`, `midi` and `voice`. See [Drive a Case with your hand, face, MIDI or voice](/help/drive-a-case-with-your-hand-face-midi-or-voice).

## Code panels

A console can hold the Case's own code in up to 4 panels. Each panel is a small web page in a column or over the canvas. For example, one panel might draw a joystick that drives the robot while another shows the robot's speed over the canvas.

[[Esc]] and [[⌘K]] keep working inside a panel. While a Case runs, **Undo** at the top right undoes changes to the code panels without touching the robot. Outside a panel or a text field, [[⌘Z]] does the same, and [[⌘I]] shows the **Agent** tab next to the Case. When you click a panel over the canvas, the click goes through to the robot unless the panel handles it.

![A rover Case running with a joystick in the right column and its speed and tilt over the canvas](/help/run-a-case/code.png)

Code panels can change the Case's world during a run. They can move, light or hide any object the Case marks as movable, such as a target that pops up or a wall that opens. To get a movable object, tell the agent which object should move when it makes the Case. Each try records these changes, so a replay shows the same world.

A panel can watch the Scene view, a camera view you placed, or one of the robot's cameras, at up to 640 × 480 and 15 frames per second. It can't watch your computer's camera.

To remember something like a high score, a panel can keep a value of up to 64 KB on this computer. The value survives **Reset** and reopening the scene, and it's gone when you delete the Case or the scene. Basecase doesn't save it with the Case, so a Case you share, open somewhere else or copy with **Duplicate Scene** starts without it.

![A rover Case running, with a code panel showing the Scene camera and the target its code moved and lit red](/help/run-a-case/world.png)

If a code panel stops answering for 2 seconds, or doesn't start within 10 seconds, it closes. In its place you see “Couldn’t run” with the panel's name and “It didn’t answer.” If the panel's script fails while it loads, you see its error there instead. If any other panel fails, it shows its title and “stopped working” with **Reload**, while the robot and the try keep going.

The agent can write these panels and change them while the Case runs. For the steps, see [Build a Case app with the agent](/help/build-a-case-app-with-the-agent).

## Run a Case from a shared link

A link you make with **Share Robot** opens the same console in a browser (see [Share a robot as a link](/help/share-a-robot-as-a-link)). Camera panels, the servos table and the tries appear only in the studio. In the browser, code panels get no camera frames and keep no values.
