---
title: Keep sketches on their supports
date: 2026-11-16
image: /changelog/keep-sketches-on-their-supports/cover.png
---

You can now keep a sketch attached to its supporting part as you move, rotate or resize the part. Start with a single rectangular planar face.

You can thicken a rover's deck and keep its mounting plate attached without redrawing it. Dimensions tied to reference edges follow those edges as you resize the deck. Coordinates you drew in millimeters keep their distance from the face's center.

Create the feature through Sketch as before, then edit the supporting part in the Inspector. Basecase regenerates dependent sketches in order, including cutouts you use with Subtract. You can undo and redo the source edit and its dependent updates, and save scenes with their support references.

If a face disappears, splits or becomes ambiguous, Basecase keeps the previous solid and adds a Sketch blocker in Checks. Use Select Face to choose a replacement. You can't attach sketches to curved faces or sculpted supports, or use affine sheet transforms. Existing independent sketches keep their placement.

Steps are in [Keep a sketch on a face](/help/keep-a-sketch-on-a-face).
