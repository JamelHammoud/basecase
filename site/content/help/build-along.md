---
title: Build a robot step by step on the canvas
date: 2026-11-13
collection: build-and-print
type: task
covers:
  - src/workspace/useBuildAlong.ts
  - src/components/build/BuildAlongBar.tsx
  - src/guide/buildAlong.ts
  - src/three/viewport/buildStep.ts
---

Build Along plays your robot's build guide on the canvas, one step at a time, so you can follow it with the parts on your desk.

1. Open [[⌘K]] and choose Build Along, or click Build Along in the build guide's toolbar.
2. Read the counts under the bar, like 4 × M3 × 6 Socket Head Screw. They're what this step uses.
3. Watch the step's parts and screws fly in along the blue arrows. Orbit to see the step from any side.
4. Put each servo into the joint its label names, like Shoulder lift, ID 2. Set the servo to that bus ID first, so Operate and the sim drive the right joint.
5. Press [[→]] for the next step and [[←]] to go back.
6. Press [[Esc]] to return to your scene. Nothing in it changes.

![A step with four screws flying into the base along blue arrows, and 4 × M3 × 6 Socket Head Screw listed under the bar](/help/build-along/step.png)

If you changed the design since the guide was last made, Build Along makes it again first, and the bar shows its progress.

![Three servos labeled Shoulder pan, ID 1, Shoulder lift, ID 2 and Elbow, ID 3](/help/build-along/servos.png)
