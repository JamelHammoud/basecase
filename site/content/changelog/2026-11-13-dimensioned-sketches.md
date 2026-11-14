---
title: Dimensioned sketches on any face
date: 2026-11-13
image: /changelog/dimensioned-sketches/cover.png
---

You can now type exact lengths in Sketch, keep constraints, and start a sketch on a part's face.

The sketch stays editable after you extrude it, so you can draw a bracket at the size you want and change that size later.

## On a face

Click a part's face, then open Sketch from ⌘K, Shapes ▾ or the right-click menu. The sketch opens on that face, and the face's edges show up dashed so you can snap to them and dimension from them. With nothing selected, the sketch opens on the ground, as before.

The new part stands on the face. Give it a negative thickness and you get a Cutout sunk into the face, ready to subtract.

![Sketch open on the top face of a box](/changelog/dimensioned-sketches/face.png)

## Typed lengths

Pick Line, Rectangle, Circle or Arc and click to start. Type a number and it becomes the length.

Tab moves to the angle for a line, or to the height for a rectangle. For a circle, the number you type is the diameter. Press Enter to place it.

![A rectangle with 40 and 20 typed in](/changelog/dimensioned-sketches/typed.png)

## Constraints

As you draw, points snap onto points and lines snap level or upright, the way they do in Figma and Shapr3D. Each snap stays as a constraint, with a small glyph beside its line.

Select two lines and a strip offers parallel, perpendicular and equal. Select a line and a circle and it offers tangent. Dimensions sit beside their lines as plain numbers.

If an edit conflicts with the rest of the sketch, Sketch refuses it and keeps the last shape.

![A dimensioned rectangle with its constraint glyphs](/changelog/dimensioned-sketches/dimensioned.png)

## Editable afterwards

The part keeps the sketch it came from. Double-click the part to reopen the sketch, then click a dimension and type a new one.

The part re-extrudes in place, even if you've moved it, and ⌘Z undoes each change in one step.

## What it doesn't do yet

Freehand drawing and the Hole tool are gone. To make a hole, draw a circle inside the outline.

Sketches don't project edges from other parts, and cuts aren't editable booleans: a cut makes a Cutout part.

Read [Draw a part from a sketch or SVG](/help/draw-a-part-from-a-sketch-or-svg) in the help center for the steps.
