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

Give the agent a size, real parts and a photo, and it builds a robot closer to the one you pictured.

## Give it a size

Without a size, the agent estimates one from your words and photos. Put the size in your first request, as in “Open Duck Mini, 40 cm tall”, and the agent sets the scale of every part from the first step.

## Name the robot or show it

If the robot exists, name it with its exact version. The agent searches GitHub for the robot's published URDF or MJCF and copies the joint layout from it. Name the wrong variant and you get a different robot: “Berkeley Humanoid Lite” and “Berkeley Humanoid” aren't interchangeable.

For anything else, attach photos taken from a few sides, or a sketch. The agent compares its model against each photo as it works, and it matches an SVG drawn in millimeters at its true size.

## Say what it must do and what it must use

A part name or a measurement shapes the design more than an adjective. Compare “a gripper” with “a gripper for an STS3215 that opens 60 mm”. Name the servos, boards and screws you already own, and give a budget if you have one. Once you [count the parts you already own](/help/count-the-parts-you-already-own), the agent picks those parts first. For an arm, give the points it must reach in mm and the grams it carries. [Size an arm from the points it must reach](/help/size-an-arm-to-its-targets) shows what you get.

## Change one thing at a time

After the first design, keep follow-ups short: “Longer legs”, “Thicker brackets”, “Round the edges”, “Use M3 screws”. The agent can't see your selection, so point at the part you mean with **Quote Part** or a mark. [Point the agent at a part](/help/point-the-agent-at-a-part) has the steps.

## Say how you want to drive it

To play with or operate a robot, name the input and the cameras you want to watch. Ask for “Drive this rover with a gamepad while I watch its front camera” and you get a Case that opens running. You can use keys, a gamepad, a phone, the computer's camera, your hand or face, MIDI and voice as inputs.

Ask for a joystick, a piano or a readout over the robot, and the agent draws it as a code panel. While the Case runs, you can ask for one change at a time, such as “Add a Spin button”. If you name a movement, as in “wave at the camera and it waves back”, the Case reacts to that gesture.

## Ask about Checks instead of hiding them

If a Check fails, ask the agent to fix it or to explain why it matters. The agent won't narrow a range or hide a part to pass a check, and it tells you when a check looks wrong. In a scene with Cases, the agent runs them before it calls a design done, and it never edits a Case to pass one.

[Agent limits](/help/agent-limits) lists what the agent won't do no matter how you ask.
