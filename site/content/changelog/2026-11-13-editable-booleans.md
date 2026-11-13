---
title: Cuts you can edit
date: 2026-11-13
image: /changelog/editable-booleans/cover.png
---

Union, Subtract and Intersect now keep the parts they were made from. You can move a servo pocket 2 mm, widen a cable hole or turn a slot without undoing the cut.

## What a cut keeps

A boolean used to replace its parts with one fixed mesh named "(Cutouts Carved)" or "(Boolean Merged)". Now the result keeps the name of the part you kept. Layers lists the parts it was made from under it, the kept part first. Old scenes open as they were; cuts made before today stay single meshes.

![Layers with Servo Mount, and Servo Mount, Servo Pocket and Cable Hole nested under it](/changelog/editable-booleans/result.png)

## Editing a cut

Double-click or ⌘-click a hole on the canvas to select the part that cut it, the way you'd reach into a group. Its row in Layers works too. It draws over the result, Cutouts in red and solid parts in translucent blue. The gizmo, the Position, Size and Rotation fields, and Delete all act on it. The cut follows each change, and each change is one step for ⌘Z.

Steps are in [Edit a cut after you make it](/help/edit-a-cut).

![The Cable Hole selected inside the plate, with the gizmo on it](/changelog/editable-booleans/drilled.png)

Click the result once to get back to the whole part. Moving, turning or resizing it carries the parts inside it along.

## Off the main thread

Cuts now run in the background with Manifold, so the app keeps drawing while they work. Two 50,000-triangle parts take about 180 ms to cut there, and the window is never held for more than about 3 ms. Undo shows the previous cut at once, because every cut is cached.

## For the agent

`get_scene` lists a cut with its operation and the ids of the parts inside it, each on its own line. The agent can move or resize one of those parts by id, the same as any part, instead of making the cut again.

## What it doesn't do yet

Save to Library keeps the result's shape without the parts inside it. Cuts made before this update can't be opened up, since they never kept their parts.
