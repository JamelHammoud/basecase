---
title: Build a robot step by step on the canvas
date: 2026-11-13
updated: 2026-11-14
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

1. Press [[⌘K]], then choose Build Along. Or click Build Along in the build guide's toolbar.
2. Check the parts this step uses. They're listed under the bar with their counts, for example 4 × M3 × 6 Socket Head Screw.
3. Watch the step's parts and screws fly in along the blue arrows. To see the step from any side, orbit the view.
4. Put each servo into the joint named on its label, for example Shoulder lift, ID 2. Before you do, set the servo to that bus ID so that Operate and the sim drive the right joint.
5. To go to the next step, press [[→]]. To go back, press [[←]].
6. To return to your scene, click **Done** at the end of the bar or press [[Esc]]. Nothing in your scene changes.

![Step 2 of 5 with Done at the end of the bar, 1 × Feetech STS3215 7.4 V (C001) listed under it, and the new servo labeled Shoulder lift, ID 2](/help/build-along/step.png)

If you changed the design since the guide was last made, Build Along makes the guide again before it starts and shows its progress in the bar.

When every printed part a step uses is marked printed, a green check appears beside the step count, and the build guide also shows a check beside the step number. If you [print plates on several printers](/help/print-plates-on-several-printers), the parts print in this order.

![Step 1 of 5 with a green check beside the count](/help/build-along/parts-ready.png)
