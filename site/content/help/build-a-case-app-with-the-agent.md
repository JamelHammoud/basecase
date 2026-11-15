---
title: Build a Case app with the agent
date: 2026-11-13
collection: simulate-and-train
type: task
order: 6
keywords:
  - app
  - code panel
  - remote
  - controls
  - write_case_code
  - live edit
  - undo
related:
  - run-a-case
  - make-a-case
covers:
  - src/workspace/agentCaseCodeRequests.ts
  - src/cases/console/codeEdits.ts
  - src/cases/console/codeReports.ts
  - src/workspace/RightPanel.tsx
  - src/workspace/useAgentRun.ts
  - electron/cad-mcp/caseCodeTools.mjs
  - electron/cad-agent-prompt.mjs
hub_the_design_agent_order: 150
hub_the_design_agent: |
  If the agent needs a control the Case's panels don't have, like a joystick or a piano, it draws one as a code panel. If that code moves an object, such as a target to whack, the agent marks the object as movable. After each write, it reads the panel's errors and a capture of the window, then fixes what broke.

  Name a movement, such as a wave, and the Case reacts to it as a gesture. If no built-in gesture matches, the agent asks you to teach it. For the steps, see [Build a Case app with the agent](/help/build-a-case-app-with-the-agent).
hub_run_a_case_order: 30
hub_run_a_case: |
  A console can hold the Case's own code in up to 4 panels. Each panel is a small web page in a column or over the canvas. For example, one panel might draw a joystick that drives the robot, and another might show the robot's speed over the canvas.

  [[Esc]] and [[⌘K]] work inside a panel. While a Case runs, **Undo** at the top right undoes changes to the code panels and the layout, and leaves the robot as it is. Outside a panel or a text field, [[⌘Z]] does the same thing, and [[⌘I]] shows the **Agent** tab beside the Case. Clicks on a panel over the canvas go through to the robot, unless the panel uses them.

  ![A rover Case running with a joystick in the right column and its speed and tilt over the canvas](/help/run-a-case/code.png)

  Code panels can change the Case's world during a run. They can move, light or hide any object the Case marks as movable, such as a target that pops up or a wall that opens. To get a movable object, tell the agent which object should move when it makes the Case. Basecase records each change in the try, so a replay shows the same world.

  A panel can watch the Scene view, a camera view you placed, or one of the robot's cameras, at up to 640 × 480 and 15 frames a second. A panel can't watch your computer's camera.

  To remember something like a high score, a panel can keep a value of up to 64 KB on this computer. The value stays after **Reset** and after you reopen the scene. Deleting the Case or the scene removes it. The Case doesn't carry the value, so a Case you share, open on another computer or copy with **Duplicate Scene** starts without it.

  ![A rover Case running, with a code panel showing the Scene camera and the target its code moved and lit red](/help/run-a-case/world.png)

  If a code panel stops answering for 2 seconds, or doesn't start within 10 seconds, it closes. In its place, you see “Couldn’t run” with the panel's name and “It didn’t answer.” If the panel's script fails while it loads, you see its error there instead. If any other panel fails, it shows its title and “stopped working” with **Reload**, and the robot and the try keep going.

  The agent can write these panels and change them during a run. For the steps, see [Build a Case app with the agent](/help/build-a-case-app-with-the-agent).
---

Describe the controls you want for your robot, and the agent builds them into a running Case. While the Case runs, you can keep asking for changes.

**Note:** The agent works in the desktop app. In this version, its panels can't move one joint on its own, drive a second robot, or save a file.

1. In the **Agent** tab, describe the app. For example: “Make a remote for the rover with big Wave, Dance, Sit and Stop buttons, and its speed over the canvas.”
2. Wait while the agent writes the app. The Case then opens and runs. Each time the agent fixes an error in a panel, that panel reloads.

![The rover Case running with a remote on the left, its speed over the canvas and the agent on the right](/help/build-a-case-app-with-the-agent/app.png)

3. Use the app. Press its buttons, or click **Try It** to start a try.
4. To change the app, type in the **Agent** tab beside the Case, such as “Add a Spin button”, then press [[↩]]. Only the panel that changes reloads, so the robot and any running try keep going.
5. To take back the agent's last change, click **Undo** at the top right. Each change the agent makes is one undo step.
6. To go back to the scene, click **Done** or press [[Esc]].

When you're not in a panel or a text field, [[⌘Z]] works the same as **Undo**, and [[⌘I]] shows or hides the agent.

The agent can't read a try while the Case is running, because reading it would reset the simulation. To ask why a try failed, stop the simulation first, or open the try on the timeline. See [Requests that get good results](/help/requests-that-get-good-results).

If you moved, resized or added panels yourself, the agent keeps your layout when it changes the app. See [Arrange a Case's console](/help/arrange-a-case-console).

To learn about the panels a Case can show and how a code panel reaches the robot, see [Run a Case](/help/run-a-case).
