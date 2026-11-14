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

Give the agent a size, real parts and a photo, and it builds a robot closer to the one you pictured.

## Give it a size

Without a size, the agent estimates one from your words and photos. If you write “Open Duck Mini, 40 cm tall”, it scales each part correctly from the first step.

## Name the robot or show it

For a robot that exists, name it down to the exact version. The agent searches GitHub for the robot's published URDF or MJCF and copies the joint layout from it. “Berkeley Humanoid Lite” and “Berkeley Humanoid” are different robots, so the agent builds whichever one you name.

For anything else, attach photos taken from a few sides, or a sketch. The agent compares its model against each photo as it works. An SVG drawn in millimeters is matched at its true size.

## Say what it must do and what it must use

Describe the job with numbers and part names instead of adjectives. “A gripper for an STS3215 that opens 60 mm” gives the agent more to design around than “a gripper”.

Name the servos, boards and screws you own, and give a budget if you have one. Once you [count the parts you already own](/help/count-the-parts-you-already-own), the agent picks your parts first.

For an arm, give the points it must reach in mm and the weight it carries in grams. [Size an arm from the points it must reach](/help/size-an-arm-to-its-targets) shows what you get.

If the robot has to perform a motion, attach a `.bvh` clip of that motion and give the robot's height. To see the result, read [Design a robot from a motion clip](/help/design-a-robot-from-a-motion-clip).

## Change one thing at a time

After the first design, keep follow-ups short: “Longer legs”, “Thicker brackets”, “Round the edges” or “Use M3 screws”.

The agent doesn't see what you've selected, so point at the part you mean with **Quote Part** or a mark. [Point the agent at a part](/help/point-the-agent-at-a-part) has the steps.

## Say how you want to drive it

To play with a robot or operate it, name the input you'll use and the cameras you want to watch. “Drive this rover with a gamepad while I watch its front camera” gets you a Case that's running when it opens.

You can use keys, a gamepad, a phone, the computer's camera, your hand or face, MIDI or voice.

Ask for a joystick, a piano or a readout over the robot, and the agent draws it as a code panel. While the Case runs, you can ask for changes to that panel one at a time, such as “Add a Spin button”.

To have the Case react to a gesture, name the movement, as in “wave at the camera and it waves back”.

## Ask about Checks instead of hiding them

When a Check fails, ask the agent to fix it or to explain why it matters. The agent won't narrow a range or hide a part to pass a check, and it tells you when a check looks wrong.

If the scene has Cases, the agent runs them before it calls a design done, and it never edits a Case to pass one.

For what the agent won't do however you ask, see [Agent limits](/help/agent-limits).
