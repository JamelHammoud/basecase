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

Build Along shows your robot's build guide on the canvas one step at a time, so you can follow along with the parts on your desk.

1. Open [[⌘K]] and choose Build Along. Or click Build Along in the build guide's toolbar.
2. Check the parts this step uses. They're listed under the bar with their counts, for example 4 × M3 × 6 Socket Head Screw.
3. Watch the step's parts and screws fly in along the blue arrows. To see the step from another side, orbit the view.
4. Set each servo to the bus ID on its label, then put it into the joint that label names, for example Shoulder lift, ID 2. That way, Operate and the sim drive the right joint.
5. Press [[→]] for the next step and [[←]] to go back.
6. Press [[Esc]] to return to your scene. Nothing in it has changed.

![A step with four screws flying into the base along blue arrows, and 4 × M3 × 6 Socket Head Screw listed under the bar](/help/build-along/step.png)

![Three servos labeled Shoulder pan, ID 1, Shoulder lift, ID 2 and Elbow, ID 3](/help/build-along/servos.png)

If you've changed the design since the last build guide, Build Along makes a new one before it starts and shows its progress in the bar.

When you mark every printed part a step uses as printed, a green check appears beside the step count, and beside the step number in the build guide. If you [print plates on several printers](/help/print-plates-on-several-printers), the parts print in the same order as these steps.

![Step 1 of 2 with a green check beside the count](/help/build-along/parts-ready.png)
