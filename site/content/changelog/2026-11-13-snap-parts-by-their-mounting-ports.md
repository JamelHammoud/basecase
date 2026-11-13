---
title: Snap parts by their mounting ports
date: 2026-11-13
image: /changelog/snap-parts-by-their-mounting-ports/cover.png
---

Drag a servo onto a bracket and it snaps into place by its real horn pattern, and stays mated when the bracket moves.

## How it works

Every catalog part already knows its mounting ports. An STS3215 has its output shaft, the four M3 holes on its horn, the idler boss and the M2 holes in its case. Agent-made parts carry the ports they were modeled with. Until now only the agent could use them.

Now, when you drag a part with Move (V), white dots show on the ports that fit something nearby. They show on the part you're dragging and on the parts around it. A hole circle fits one with the same count, pitch and thread, and a screw hole fits a hole of the same thread. An output shaft or boss fits a bore it slides into. Bring a dot within about 8 mm of its partner and the pair turns blue as the part jumps into place.

The part turns so the two line up. Let go and it's mated. Steps are in [Snap parts together by their mounting holes](/help/snap-parts-together-by-their-mounting-holes).

![A servo dragged toward a bracket, with dots on the ports that fit](/changelog/snap-parts-by-their-mounting-ports/near.png)

## Mates are kept

A mated part follows the part it's on. Move the bracket, or have the agent remodel it, and the servo comes along. Drag the servo more than about 8 mm away and the mate drops. ⌘Z undoes a snap and its mate in one step.

![The servo mated to the bracket after letting go](/changelog/snap-parts-by-their-mounting-ports/mated.png)

## Drops and free moves

Dropping a tile from Parts, or a one-part model from the Library, snaps the same way at the drop point. Hold ⌘ (Ctrl on Windows) while dragging to move without snapping; Shift still turns off the grid.

## Same as the agent

Snapping uses the agent's own `mate` placement for the pair it finds. A part you snap by hand and a part the agent mates land in exactly the same spot. The agent now also says when two ports it mates don't fit, such as M3 holes against M2.

## What it doesn't do yet

Screws, nuts and inserts don't snap; the agent's fasten places them. Groups and multi-part selections move without snapping, and snapping is off while a robot is posed. Rotate and Scale don't snap to ports.
