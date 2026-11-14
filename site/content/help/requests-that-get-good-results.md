---
title: Requests that get good results
date: 2026-11-13
updated: 2026-11-14
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

Give the agent a size, real parts and a photo, and the robot it builds will be closer to the one you pictured.

## Give it a size

If you don't give a size, the agent estimates one from your words and photos. A request like “Open Duck Mini, 40 cm tall” puts every part at the right scale from the first step.

## Name the robot or show it

If the robot exists, name it and its exact version. The agent searches GitHub for the robot's published URDF or MJCF and copies the joint layout from it. Name the wrong variant and you get a different robot: “Berkeley Humanoid Lite” and “Berkeley Humanoid” aren't interchangeable.

For any other robot, attach photos from a few sides, or a sketch. As it works, the agent compares its model against each photo. If you attach an SVG drawn in millimeters, the agent matches it at its true size.

## Say what it must do and what it must use

A number or a part name changes the design more than an adjective. Compare “a gripper” with “a gripper for an STS3215 that opens 60 mm”. Include any of these that apply:

- **Parts you already own.** Name the servos, boards and screws you have. Once you [count the parts you already own](/help/count-the-parts-you-already-own), the agent picks those parts first.
- **A budget**, if you have one.
- **Reach and load, for an arm.** Give the points it must reach in mm and the grams it carries. [Size an arm from the points it must reach](/help/size-an-arm-to-its-targets) shows what you get.

## Change one thing at a time

After the first design, short follow-ups work best. For example:

- “Longer legs”
- “Thicker brackets”
- “Round the edges”
- “Use M3 screws”

The agent doesn't see your selection, so point at the part you mean with **Quote Part** or a mark. [Point the agent at a part](/help/point-the-agent-at-a-part) has the steps.

## Say how you want to drive it

To play with or operate a robot, name the input you'll use and the cameras you want to watch. “Drive this rover with a gamepad while I watch its front camera” gets you a Case that opens running.

You can use any of these inputs:

- Keys
- A gamepad
- A phone
- The computer's camera
- Your hand or face
- MIDI
- Voice

If you ask for a joystick, a piano or a readout over the robot, the agent draws it as a code panel. While the Case runs, you can ask for changes to the panel one at a time, such as “Add a Spin button”. If you name a movement, as in “wave at the camera and it waves back”, the Case reacts to that gesture.

After a try, you can ask what happened, such as “Why did it fall?” The agent answers from the try's recording, with times and values.

## Ask about Checks instead of hiding them

When a Check fails, ask the agent to fix it, or ask why it matters. The agent won't narrow a range or hide a part to pass a check, and it tells you when a check looks wrong.

If the scene has Cases, the agent runs them before it calls a design done. It never edits a Case to pass one.

For what the agent won't do no matter how you ask, see [Agent limits](/help/agent-limits).
