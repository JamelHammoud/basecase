---
title: Dimensioned sketches on any face
date: 2026-11-13
image: /changelog/dimensioned-sketches/cover.png
---

Sketch now takes typed lengths, keeps constraints and opens on a part's face. It stays editable after you extrude it, so a sketched bracket comes out at the size you meant.

## On a face

Click a part's face, then open Sketch from ⌘K, Shapes ▾ or the right-click menu. The sketch opens on that face with its edges dashed, so you can snap to them and dimension from them. With nothing selected it opens on the ground, as before. The new part stands on the face; give it a negative thickness and it becomes a Cutout sunk into the face, ready to subtract.

![Sketch open on the top face of a box](/changelog/dimensioned-sketches/face.png)

## Typed lengths

Pick Line, Rectangle, Circle or Arc and click to start. Type a number and it becomes the length; Tab moves to the angle for a line, or to the height for a rectangle. A circle takes its diameter. Enter places it.

![A rectangle with 40 and 20 typed in](/changelog/dimensioned-sketches/typed.png)

## Constraints

As you draw, points snap onto points and lines snap level or upright, the way Figma and Shapr3D do it. Each snap is kept as a constraint, shown as a small glyph beside its line. Select two lines and a strip offers parallel, perpendicular and equal; a line and a circle offer tangent. Dimensions sit beside their lines as plain numbers. An edit that conflicts with the rest is refused and the sketch keeps its last shape.

![A dimensioned rectangle with its constraint glyphs](/changelog/dimensioned-sketches/dimensioned.png)

## Editable afterwards

The sketch is saved on the part it made. Double-click the part to reopen it, click a dimension and type a new one. The part re-extrudes in place, even if you've moved it, and ⌘Z undoes each change in one step.

Steps are in [Sketch a part to exact dimensions](/help/sketch-a-part-to-exact-dimensions).

## What it doesn't do yet

Freehand drawing and the Hole tool are gone; a circle inside the outline is a hole now. Sketches don't project edges from other parts, and a cut makes a Cutout part rather than an editable boolean.
