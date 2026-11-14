---
title: Build a robot step by step on the canvas
date: 2026-11-13
collection: build-and-print
type: task
covers:
  - src/workspace/useBuildAlong.ts
  - src/guide/viewer/readyMarks.ts
  - src/components/build/BuildAlongBar.tsx
  - src/guide/buildAlong.ts
  - src/three/viewport/buildStep.ts
---

Build Along plays your robot's build guide on the canvas one step at a time, so you can follow along with the parts on your desk.

1. Open [[⌘K]] and choose Build Along. Or click Build Along in the build guide's toolbar.
2. Check the parts this step uses. They're listed under the bar with their counts, for example 4 × M3 × 6 Socket Head Screw.
3. Watch the step's parts and screws fly in along the blue arrows. You can orbit to see the step from any side.
4. Put each servo into the joint named on its label, for example Shoulder lift, ID 2. First set the servo to that bus ID, so that Operate and the sim drive the right joint.
5. To go to the next step, press [[→]]. To go back, press [[←]].
6. To return to your scene, press [[Esc]]. Nothing in your scene changes.

![A step with four screws flying into the base along blue arrows, and 4 × M3 × 6 Socket Head Screw listed under the bar](/help/build-along/step.png)

If you changed the design since the guide was last made, Build Along makes the guide again first and shows its progress in the bar.

![Three servos labeled Shoulder pan, ID 1, Shoulder lift, ID 2 and Elbow, ID 3](/help/build-along/servos.png)

A green check appears beside the step count when every printed part the step uses is marked printed. The build guide also shows a check beside the step number. When you [print plates on several printers](/help/print-plates-on-several-printers), the parts print in this order.

![Step 1 of 2 with a green check beside the count](/help/build-along/parts-ready.png)
