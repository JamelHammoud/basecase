---
title: Cuts you can edit
date: 2026-11-13
image: /changelog/editable-booleans/cover.png
---

Union, Subtract and Intersect now keep the parts they were made from.

Move a servo pocket 2 mm, widen a cable hole or turn a slot, and the cut updates without you undoing it first.

## What a cut keeps

Until now, a boolean replaced its parts with one fixed mesh, named "(Cutouts Carved)" or "(Boolean Merged)". Now the result keeps the name of the part you kept, and Layers lists the parts it was made from under it, with the kept part first.

![Layers with Servo Mount, and Servo Mount, Servo Pocket and Cable Hole nested under it](/changelog/editable-booleans/result.png)

## Editing a cut

Double-click or ⌘-click a hole on the canvas to select the part that cut it, the same way you reach into a group. You can also click its row in Layers.

The selected part draws over the result, with cutouts in red and solid parts in translucent blue. The gizmo, the Position, Size and Rotation fields, and Delete all act on it. The cut updates with each change, and each change is one step for ⌘Z.

The steps are in [Edit a cut after you make it](/help/edit-a-cut).

![The Cable Hole selected inside the plate, with the gizmo on it](/changelog/editable-booleans/drilled.png)

Click the result once to get back to the whole part. Move, turn or resize it and the parts inside it come along.

## Off the main thread

Cuts now run in the background with Manifold, so the app keeps drawing while they work. Cutting two 50,000-triangle parts takes about 180 ms, and the window is never held up for more than about 3 ms.

Every cut is cached, so Undo shows the previous cut at once.

## For the agent

`get_scene` lists a cut with its operation and the ids of the parts inside it, each on its own line. The agent can move or resize one of those parts by id, the same as any other part, without making the cut again.

## What it doesn't do yet

Save to Library keeps the result's shape, but not the parts inside it.

Old scenes open as they were. Cuts made before this update stay single meshes and can't be opened up, because they never kept their parts.
