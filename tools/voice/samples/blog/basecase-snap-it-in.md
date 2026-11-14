---
title: "Snap It In"
date: 2026-11-13
image: /changelog/snap-parts-by-their-mounting-ports/cover.png
---

You can now snap parts together by their mounting holes.

Drag a part with the Move tool (V), and small white dots show up on the mounting points that fit something nearby. You see them on the part you're dragging and on the parts around it.

Bring a matching pair within 8 mm and both dots turn blue. The part jumps into place, rotated so the two line up. Let go of the mouse and the part is mated to the other one.

![The servo attached to the bracket after letting go](/changelog/snap-parts-by-their-mounting-ports/mated.png)

Until now, only the agent placed parts by their ports, with its mate tool. If you placed a servo by hand, you had to line it up by eye and type in coordinates. Now you drag it to the bracket and let go.

## What Fits

Catalog parts already carry their ports. The Feetech STS3215 servo, for example, has its output shaft, the four M3 holes on its horn, the idler boss, and the M2 holes in its case. Parts the agent models carry the ports they were modeled with.

Two ports only snap if they fit. A hole circle pairs with one that has the same count, pitch and thread, so an M3 horn won't pair with M2 holes. A screw hole pairs with a hole of the same thread. An output shaft or a boss pairs with a bore it fits in.

## Mated Parts Follow Along

Move the bracket, or have the agent remodel it, and the servo mated to it moves with it.

Drag a mated part more than 8 mm away and the mate is removed. Or press ⌘Z, which undoes the snap and its mate in one step.

Dropping a tile from the Parts panel, or a one-part model from the Library, snaps the same way at the point where you drop it.

If you want to move a part without snapping, hold ⌘ (Ctrl on Windows) while you drag. Shift still turns off grid snapping.

## Same Placement as the Agent

Hand snapping uses the agent's own mate placement, so a part you snap by hand lands exactly where the agent would put it.

The agent also got stricter. When you ask it to mate two ports that don't fit, like M3 holes against M2 holes, it now tells you instead of mating them anyway.

## What Doesn't Snap

Screws, nuts and inserts don't snap. The agent's fasten tool places those. Groups and multi-part selections don't snap either. Nothing snaps while a robot is posed, and Rotate and Scale don't snap to ports.

Read [Snap parts together by their mounting holes](/help/snap-parts-together-by-their-mounting-holes) in the help center for the steps.