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

Give the agent a size, real parts and a photo, and the robot it builds lands much closer to the one you pictured.

## Give it a size

Without a size, the agent estimates one from your words and photos. “Open Duck Mini, 40 cm tall” anchors every part to the right scale from the first step.

## Name the robot or show it

If the robot exists, name it, with the exact version. The agent searches GitHub for its published URDF or MJCF, and copies the joint layout from it. A wrong variant gives a different robot, so “Berkeley Humanoid Lite” and “Berkeley Humanoid” aren't interchangeable.

For anything else, attach photos from a few sides, or a sketch. The agent compares its model against each photo as it goes, and an SVG drawn in millimeters is matched at its true size.

## Say what it must do and what it must use

Real constraints change the design more than adjectives do. Compare “a gripper” with “a gripper for an STS3215 that opens 60 mm”. Name servos, boards and screws you already own, and a budget if you have one. For an arm, give the points it must reach in mm and the grams it carries. [Size an arm from the points it must reach](/help/size-an-arm-to-its-targets) shows what you get.

## Change one thing at a time

After the first design, short follow-ups work best: “Longer legs”, “Thicker brackets”, “Round the edges”, “Use M3 screws”. Point at the part you mean with **Quote Part** or a mark, since the agent doesn't see your selection. [Point the agent at a part](/help/point-the-agent-at-a-part) has the steps.

## Say how you want to drive it

To play with or operate a robot, name the input and the cameras to watch. “Drive this rover with a gamepad while I watch its front camera” gets a Case that opens running. Inputs are keys, a gamepad, a phone, the computer's camera, your hand or face, MIDI and voice. Ask for a joystick, a piano or a readout over the robot, and the agent draws it as a code panel. Ask for changes to it while the Case runs, one at a time, such as “Add a Spin button”. Name a movement, as in “wave at the camera and it waves back”, and the Case reacts to that gesture.

## Ask about Checks instead of hiding them

When a Check fails, ask the agent to fix it, or why it matters. It won't narrow a range or hide a part to pass a check, and it tells you when a check looks wrong. When the scene has Cases, it runs them before it calls a design done. It never edits a Case to pass one.

For what the agent won't do however you ask, see [Agent limits](/help/agent-limits).
