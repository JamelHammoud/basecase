---
title: Requests that get good results
date: 2026-11-13
updated: 2026-11-13
collection: agent
type: concept
order: 2
keywords:
  - prompting
  - prompt tips
  - how to ask
  - better results
  - examples
related:
  - design-a-robot-with-the-agent
  - attach-photos-files-and-sketches
  - make-a-case-pass-with-the-agent
  - build-a-case-app-with-the-agent
covers:
  - electron/cad-agent-prompt.mjs
  - electron/backend/promptBlocks.mjs
  - src/components/agent/Composer.tsx
---

The robot the agent builds comes out much closer to the one you have in mind when you give it a size, real parts and a photo.

## Give it a size

Without a size, the agent estimates one from your words and photos. If you write “Open Duck Mini, 40 cm tall”, it builds each part at the right scale from the first step.

## Name the robot or show it

If the robot already exists, name it with the exact version. The agent searches GitHub for the robot's published URDF or MJCF and copies its joint layout. Because it copies the layout of the version you name, “Berkeley Humanoid Lite” and “Berkeley Humanoid” give you different robots.

For anything else, attach a sketch or photos from a few sides. As it works, the agent compares its model against each photo. If you attach an SVG drawn in millimeters, it matches the drawing at its true size.

## Say what it must do and what it must use

A constraint changes the design more than an adjective does. For example, ask for “a gripper for an STS3215 that opens 60 mm” instead of “a gripper”. Name the servos, boards and screws you already own, and a budget if you have one. Once you [count the parts you already own](/help/count-the-parts-you-already-own), the agent picks those parts first.

For an arm, give the points it must reach in mm and the grams it carries. [Size an arm from the points it must reach](/help/size-an-arm-to-its-targets) shows what you get.

If the robot must perform a motion, attach the motion as a .bvh file. The agent fits the joints and servos to it before it designs the body.

## Change one thing at a time

After the first design, keep follow-ups short: “Longer legs”, “Thicker brackets”, “Round the edges”, “Use M3 screws”. The agent doesn't see your selection, so point at the part you mean with **Quote Part** or a mark. For the steps, see [Point the agent at a part](/help/point-the-agent-at-a-part).

## Say how you want to drive it

To play with or operate a robot, name the input and the cameras you want to watch. For example, “Drive this rover with a gamepad while I watch its front camera” gets you a Case that opens running.

You can drive with keys, a gamepad, a phone, the computer's camera, your hand or face, MIDI or voice. A joystick, a piano or a readout over the robot comes back from the agent as a code panel.

While the Case runs, ask for changes one at a time, such as “Add a Spin button”. To have the Case react to a gesture, name the movement, as in “wave at the camera and it waves back”.

## Ask about Checks instead of hiding them

If a Check fails, ask the agent to fix it or to explain why it matters. The agent won't narrow a range or hide a part to pass a check, and it tells you when a check looks wrong. In a scene with Cases, it runs them before it calls a design done, and it never edits a Case to pass one.

For what the agent won't do however you ask, see [Agent limits](/help/agent-limits).
