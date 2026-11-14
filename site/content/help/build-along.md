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

1. Open [[⌘K]] and choose Build Along, or click Build Along in the build guide's toolbar.
2. Check the parts this step uses. They appear under the bar with their counts, for example 4 × M3 × 6 Socket Head Screw.
3. Watch the step's parts and screws fly in along the blue arrows. To see the step from any side, orbit the view.
4. Set each servo to the bus ID on its label, then put it into the joint named on that label, for example Shoulder lift, ID 2. That way Operate and the sim drive the right joint.
5. Press [[→]] to go to the next step, or [[←]] to go back.
6. To return to your scene, click **Done** or press [[Esc]]. Nothing in your scene changes.

![A step with four screws flying into the base along blue arrows, and 4 × M3 × 6 Socket Head Screw listed under the bar](/help/build-along/step.png)

![Three servos labeled Shoulder pan, ID 1, Shoulder lift, ID 2 and Elbow, ID 3](/help/build-along/servos.png)

If you changed the design after the guide was last made, Build Along makes the guide again before it starts and shows the progress in the bar.

A green check appears beside the step count once every printed part the step uses is marked printed. The build guide also shows a check beside the step number. When you [print plates on several printers](/help/print-plates-on-several-printers), the parts print in this order.

![Step 1 of 2 with a green check beside the count](/help/build-along/parts-ready.png)
