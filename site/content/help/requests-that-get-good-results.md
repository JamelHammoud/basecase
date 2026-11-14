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

Give the agent a size, real parts and a photo, and the robot it builds comes out closer to the one you pictured.

## Give it a size

Without a size, the agent estimates one from your words and photos. A request like “Open Duck Mini, 40 cm tall” puts every part at the right scale from the first step.

## Name the robot or show it

If the robot already exists, name it with the exact version. The agent searches GitHub for the robot's published URDF or MJCF and copies its joint layout. If you name the wrong variant, you get a different robot. For example, “Berkeley Humanoid Lite” and “Berkeley Humanoid” aren't interchangeable.

For any other robot, attach a sketch or photos taken from a few sides. The agent compares its model against each photo as it works. If you attach an SVG drawn in millimeters, the agent matches it at its true size.

## Say what it must do and what it must use

“A gripper for an STS3215 that opens 60 mm” tells the agent more than “a gripper”. The servo and the 60 mm opening change the design more than any adjective you could add.

Name the servos, boards and screws you already own, and your budget if you have one. Once you [count the parts you already own](/help/count-the-parts-you-already-own), the agent picks those parts first.

For an arm, give the points it must reach in mm and the grams it carries. [Size an arm from the points it must reach](/help/size-an-arm-to-its-targets) shows what you get.

## Change one thing at a time

After the first design, short follow-ups work best, such as “Longer legs”, “Thicker brackets”, “Round the edges” or “Use M3 screws”. The agent doesn't see your selection, so point at the part you mean with **Quote Part** or a mark. For the steps, see [Point the agent at a part](/help/point-the-agent-at-a-part).

## Say how you want to drive it

To play with or operate a robot, tell the agent which input to use and which cameras you want to watch. For example, “Drive this rover with a gamepad while I watch its front camera” gets you a Case that opens running. You can drive with keys, a gamepad, a phone, the computer's camera, your hand or face, MIDI or voice.

Ask for a joystick, a piano or a readout over the robot, and the agent draws it as a code panel. While the Case runs, you can ask for changes to that panel one at a time, such as “Add a Spin button”. If you name a movement, as in “wave at the camera and it waves back”, the Case reacts to that gesture.

## Ask about Checks instead of hiding them

If a Check fails, ask the agent to fix it or to explain why it matters. The agent won't narrow a range or hide a part to pass a check, and it tells you when a check looks wrong. In a scene with Cases, the agent runs them before it calls a design done, and it never edits a Case to pass one.

[Agent limits](/help/agent-limits) lists what the agent won't do no matter how you ask.
