---
title: Teach a robot a gesture
date: 2026-11-13
collection: simulate-and-train
type: task
keywords:
  - gesture
  - wave
  - salute
  - clap
  - nod
  - camera
  - body language
  - sign
related:
  - drive-a-robot-with-your-camera
  - run-a-case
covers:
  - src/cameras/gestures/
  - src/components/gestures/
  - src/workspace/TeachGestureHost.tsx
  - src/workspace/inputCommands.tsx
  - src/cases/gestures.ts
---

Show the camera a movement three times, and the open Case can react whenever you make that movement again.

Ten built-in gestures work without teaching: Wave, Raise Hand, Raise Both Hands, Point Left, Point Right, Thumbs Up, Open Palm, Clap, Nod and Shake Head.

**Note:** The Case saves only the movement you taught. The camera's picture is saved only while a robot is connected, as the video of that session's try. See [Record a robot session as a try](/help/record-a-robot-session-as-a-try).

Gestures work while the camera is driving a humanoid or a fixed arm. With any other robot, the camera doesn't open.

1. Open a Case. You'll find Cases under **Play** ▸ **Cases**.
2. Press [[⌘K]], then choose **Drive with Camera**.
3. Stand where the camera can see you from the hips up.
4. Press [[⌘K]], then choose **Teach Gesture**.
5. Type a name for the movement, then click **Record**.

![Teach Gesture with the name salute typed and the Record button](/help/teach-a-robot-a-gesture/name.png)

6. When the countdown reaches zero, make the movement once. You have 3 seconds.

![Teach Gesture counting down from 3, with three dots for the three recordings](/help/teach-a-robot-a-gesture/countdown.png)

7. After each of the next two countdowns, make the movement again. A dot fills in for each recording, and the sheet closes after the third one.

If you stand still during a recording, the countdown for that recording starts over.

Names can use lowercase letters, numbers and dashes, but a name can't match a built-in gesture. Teaching a name again replaces the old recording with the new one.

Each Case can hold up to 8 gestures, including names the agent added that nobody has taught. When a Case has 8, **Record** stays off for any new name.

In the Case's logic, each gesture arrives as the event **gesture**, with the gesture's name as its value. To set up a reaction, describe it to the agent, for example "when I salute, the dog bows". A gesture can also press a button in a running Case. For example, a thumbs up can start a try. To learn how a running Case is laid out, see [Run a Case](/help/run-a-case).
