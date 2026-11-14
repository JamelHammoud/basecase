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

Show the camera a movement three times, and the open Case can react each time you make it again.

Ten gestures need no teaching: Wave, Raise Hand, Raise Both Hands, Point Left, Point Right, Thumbs Up, Open Palm, Clap, Nod and Shake Head. The camera's picture is never saved; only the taught movement is, inside the Case.

Gestures work while the camera drives a humanoid or a fixed arm. On other robots the camera doesn't open.

1. Open a Case. Pick one under **Play** ▸ **Cases**.
2. Press [[⌘K]] and choose **Drive with Camera**.
3. Stand where the camera sees you from the hips up.
4. Press [[⌘K]] and choose **Teach Gesture**.
5. Type a name for the movement and click **Record**.

![Teach Gesture with the name salute typed and the Record button](/help/teach-a-robot-a-gesture/name.png)

6. When the countdown reaches zero, make the movement once. You have 3 seconds.

![Teach Gesture counting down from 3, with three dots for the three recordings](/help/teach-a-robot-a-gesture/countdown.png)

7. Make it again after each of the next two countdowns. A dot fills for each recording, and the sheet closes after the third.

If you stood still through a recording, its countdown starts again. A name can hold lowercase letters, numbers and dashes, and can't be a built-in gesture's name. Teaching a name again replaces it. A Case holds up to 8 taught gestures.

The Case's logic reads each gesture as the event **gesture**, with the gesture's name as its value. Ask the agent for the reaction in words, such as "when I salute, the dog bows". A button in a running Case can also be pressed by a gesture, so a thumbs up can start a try. Laying out a running Case is in [Run a Case](/help/run-a-case).
