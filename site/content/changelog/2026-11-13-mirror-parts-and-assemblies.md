---
title: Mirror parts and whole assemblies
date: 2026-11-13
image: /changelog/mirror-parts-and-assemblies/cover.png
---

You can now mirror any selection of parts to the other side, with its servos, mates and joints. A finished left leg becomes a right leg in one step.

Mirror is in the right-click menu and the Inspector, across the Side, Front or Top plane. ⌘K mirrors across the last plane you picked. The agent could already mirror parts, but a person had to ask it to.

Take a left leg with an STS3215 at the hip and two hinges. Mirror it across Side and you get the right leg. The copy has a second STS3215, joints named Right hip and Right knee, and the same ranges. The same angle on both hips moves the legs as mirror images.

The plane runs through the middle of the selection. For part of a robot, Side runs through the middle of its body, so the copy lands where the other side goes. A servo is never flipped into a part nobody sells. The copy is the same servo, turned so its output shaft lands within 0.1 mm of the mirrored one.

Shapes the agent modeled, meshes and sculpted parts are mirrored shape and all. Mates move to the matching port on the other side.

Each Mirror makes new copies. Mirroring the left leg again adds a third leg rather than updating the right one.

Steps are in [Mirror parts to the other side](/help/mirror-parts).
