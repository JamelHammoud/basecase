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

You can run a Case in the whole window, laid out the way the Case asks. The robot sits on the canvas, with the cameras, numbers, plots, buttons and tries the Case needs around it.

## Run a Case

1. Open a Case. Pick one under **Play** ▸ **Cases**, or make one with **New Case**. It opens in the Simulate tab.
2. Click the expand button in the Case's header. Or press [[⌘K]] and choose **Run Case**.

![The Simulate tab with Touch the Dots open and the Run Case tooltip on its expand button](/help/run-a-case/brief.png)

3. Look at the cards around the canvas. If the Case has no layout of its own, its cameras are on the left: the Scene view or your stationary camera views, then one tile for each camera on the robot. The brief, the emulated robot and your tries are on the right. Click a camera tile to draw it sharper, or right-click it for Look Through, Rename and Lens.

![The Case running with the cameras on the left, the arm in the middle and the brief, Connect Emulated Robot and Try It on the right](/help/run-a-case/center.png)

4. In the desktop app, click **Connect Emulated Robot**. You see how many servos there are and whether the motors are running, and Stop shows while they run. Below that are the daemon's newest message and each servo's angle and temperature.

![Three emulated servos connected, motors off, each reading its angle](/help/run-a-case/connected.png)

5. Click **Try It**, then drive with [[W A S D]], [[Q]] and [[E]], or with a gamepad. Anything the Case counts as a failure shows in red under the brief as soon as it happens.

![A try running, with the clock and Stop Try](/help/run-a-case/trying.png)

6. Click **Stop Try**, or wait for the clock to run out. The try appears in Results. Once a try passes, you can choose Replay, Export Dataset or Publish to Hugging Face in Results. After five passing tries, you can also choose Train from Tries there.

![Results with the recorded try](/help/run-a-case/tries.png)

7. To go back, click **Done** or press [[Esc]]. The first [[Esc]] stops driving. Your parts, selection and camera are the way you left them.

Picking a view in the rail also takes you back, and so does any [[⌘K]] command except driving, trying, **Multiply** and the dataset commands.

## Give a Case its own layout

A Case can bring its own layout, called its console. Basecase saves the console with the Case in your `.basecase` file. To get one, describe the Case you want to the agent, and it writes the console for you. You can also edit that file yourself. A Case you make with New Case or from a template has no console.

A console lists:

- Which inputs drive the Case
- Which cards sit on each side of the canvas, and how wide they are
- What each card holds

A card can hold a camera, a big number such as a timer or a score, a plot of joint angles over time, a table of joints, a button such as Reset, the tries, the failures, some text, or a map of the world from above.

For example, a game Case can put its time and score on the left and Try It, Reset and the tries on the right. The time counts down as you play. Between tries, Reset puts the robot, the blocks and the score back.

If a console lists `camera` among its inputs, **Try It** opens your computer's camera, and your arms drive a humanoid or an arm. See [Drive a robot with your camera](/help/drive-a-robot-with-your-camera). The Case's logic receives the gestures you make, and the Case can set a button to press when you make one. See [Teach a robot a gesture](/help/teach-a-robot-a-gesture). A console can also list `hand`, `face`, `midi` and `voice`. See [Drive a Case with your hand, face, MIDI or voice](/help/drive-a-case-with-your-hand-face-midi-or-voice).

![A block game console during a try: Time counting down and Score on the left, the arm in the middle, Try It, Reset and the running try on the right](/help/run-a-case/console.png)

## Add code panels

A console can hold the Case's own code in up to 4 panels. Each panel is a small web page that sits in a column or over the canvas. For example, one panel might draw a joystick that drives the robot, and another might show the robot's speed over the canvas.

- [[Esc]] and [[⌘K]] keep working inside a panel.
- While a Case runs, **Undo** at the top right undoes changes to the code panels. It leaves the robot as it is.
- Outside a panel or a text field, [[⌘Z]] does the same, and [[⌘I]] shows the **Agent** tab beside the Case.
- Clicks on a panel over the canvas go through to the robot, unless the panel takes them.

![A rover Case running with a joystick in the right column and its speed and tilt over the canvas](/help/run-a-case/code.png)

### Change the world during a run

Code panels can change the Case's world mid-run. They can move, light or hide any object the Case marks as movable, such as a target that pops up or a wall that opens. To get a movable object, tell the agent which object should move when it makes the Case. The try records each change, so a replay shows the same world.

### Watch a camera

A panel can watch the Scene view, a camera view you placed or one of the robot's cameras, at up to 640 × 480 and 15 frames a second. It can't watch your computer's camera.

### Keep a value

To remember something like a high score, a panel can keep a value of up to 64 KB on this computer. The value survives **Reset** and reopening the scene, and goes away when you delete the Case or the scene.

The value stays on this computer and doesn't travel with the Case. A Case you share, open elsewhere or copy with **Duplicate Scene** starts without it.

![A rover Case running, with a code panel showing the Scene camera and the target its code moved and lit red](/help/run-a-case/world.png)

### If a panel stops working

If a code panel stops answering for 2 seconds, or doesn't start within 10 seconds, it closes. In its place you see “Couldn’t run” with the panel's name and “It didn’t answer.” If the panel's script fails while it loads, you see its error there instead.

The agent can write these panels and change them during a run. For the steps, see [Build a Case app with the agent](/help/build-a-case-app-with-the-agent).

## Run a Case in the browser

A link you make with **Share Robot** opens the same console in the browser. See [Share a robot as a link](/help/share-a-robot-as-a-link).

Camera panels, the servos table and the tries stay in the studio. Code panels in the browser get no camera frames and keep no values.
