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

Give the agent a size, real parts and a photo, and you get a robot closer to the one you pictured.

## Give it a size

Without a size, the agent estimates one from your words and photos. Write one into your request, like “Open Duck Mini, 40 cm tall”, and the agent builds each part at the right scale from the first step.

## Name the robot or show it

For a robot that exists, give its name and exact version. The agent searches GitHub for the robot's published URDF or MJCF and copies the joint layout from it. “Berkeley Humanoid Lite” and “Berkeley Humanoid” are different robots, so name the variant you want.

For any other robot, attach photos from a few sides, or a sketch. The agent compares its model against each photo as it works. If you attach an SVG drawn in millimeters, the agent matches it at its true size.

## Say what it must do and what it must use

A number or a part name changes the design more than an adjective does. Compare “a gripper” with “a gripper for an STS3215 that opens 60 mm”. Add whichever of these apply:

- **Parts you already own.** Name the servos, boards and screws you have. After you [count the parts you already own](/help/count-the-parts-you-already-own), the agent picks those parts first.
- **A budget**, if you have one.
- **Reach and load, for an arm.** List the points it must reach in mm and the grams it carries. [Size an arm from the points it must reach](/help/size-an-arm-to-its-targets) shows the result.
- **A motion, for a robot that performs one.** Attach a `.bvh` clip of the motion and give the robot's height. [Design a robot from a motion clip](/help/design-a-robot-from-a-motion-clip) shows the result.

## Change one thing at a time

Once you have a first design, short follow-ups get the best results:

- “Longer legs”
- “Thicker brackets”
- “Round the edges”
- “Use M3 screws”

The agent doesn't see what you've selected, so point at the part you mean with **Quote Part** or a mark. [Point the agent at a part](/help/point-the-agent-at-a-part) has the steps.

## Say how you want to drive it

To play with or operate a robot, name your input and the cameras you want to watch. A request like “Drive this rover with a gamepad while I watch its front camera” gets you a Case that's running the moment it opens.

The inputs you can name:

- Keys
- A gamepad
- A phone
- The computer's camera
- Your hand or face
- MIDI
- Voice

If you ask for a joystick, a piano or a readout over the robot, the agent draws it as a code panel. While the Case runs, you can change the panel one request at a time, with something like “Add a Spin button”. To have the Case react to a gesture, name the movement, as in “wave at the camera and it waves back”.

After a try, ask what happened, such as “Why did it fall?” The agent answers from the try's recording, with times and values. It won't read a try while the simulation is running, so it can't end one you're driving. Stop the simulation first, or open the try on the timeline.

## Ask about Checks instead of hiding them

If a Check fails, ask the agent to fix it or to explain why it matters. The agent won't narrow a range or hide a part to pass a check, and it tells you when a check looks wrong.

In a scene with Cases, the agent runs them before it calls a design done. It won't edit a Case to make it pass.

[Agent limits](/help/agent-limits) lists what the agent won't do, however you ask.
