---
title: Mirror parts and whole assemblies
date: 2026-11-13
image: /changelog/mirror-parts-and-assemblies/cover.png
---

You can now mirror any selection of parts to the other side, with its servos, mates and joints. Finish the left leg, mirror it, and you have the right leg.

Mirror is in the right-click menu and the Inspector, and you pick the Side, Front or Top plane. ⌘K mirrors across the last plane you picked.

Until now, the agent could mirror parts, but only when you asked it to.

## Servos and Joints Come Along

Take a left leg with an STS3215 at the hip and two hinges. Mirror it across Side and you get the right leg, with a second STS3215, joints named Right hip and Right knee, and the same ranges. Set both hips to the same angle and the legs move as mirror images.

## Where the Copy Lands

The plane passes through the middle of the selection. When you mirror part of a robot, Side passes through the center of the robot's body, so the copy lands on the robot's other side.

Flipping a servo would turn it into a part nobody sells, so the copy is the same servo, rotated so its output shaft lands within 0.1 mm of the mirrored one.

Shapes the agent modeled, meshes and sculpted parts are mirrored, shape and all. Mates move to the matching port on the other side.

## Each Mirror Makes New Copies

Mirror the left leg again and you get a third leg. The right leg stays as it is.

Read [Mirror parts to the other side](/help/mirror-parts) in the help center for the steps.
