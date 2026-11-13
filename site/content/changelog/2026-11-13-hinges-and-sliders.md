---
title: Hinges and sliders between your own parts
date: 2026-11-13
image: /changelog/hinges-and-sliders/cover.png
---

Select two parts and choose Add Hinge or Add Slider, and the second part turns or slides on the first, ready to pose in the Pose tab and to simulate.

## Where it is

Select the part that stays put, then Shift-click the part that moves. Add Hinge and Add Slider appear in the right-click menu for the selection and in ⌘K whenever exactly two parts are selected.

![Add Hinge and Add Slider in the right-click menu](/help/join-two-parts-with-a-hinge/menu.png)

## How the axis is found

If one part has a shaft in a bore on the other, the joint goes straight onto that axis with no click. Otherwise you click a round face on either part, and Basecase fits a cylinder to it: its axis becomes the joint's axis and its centre the pivot. It works the same on a cylinder from Shapes, a catalog part, an imported mesh or a STEP body. Flat faces don't give an axis, so the cursor turns into a no-entry sign over them and a click does nothing.

## What you get

The joint takes the moving part's name. A hinge starts at ±90°; a slider starts with the travel that keeps the two parts overlapping. The Pose tab opens on it, the moving part is selected, and the ring on the canvas turns it. Right-click its row for Range or Delete. ⌘Z takes the whole joint back out in one step.

![The new hinge turned to 40° in the Pose tab](/changelog/hinges-and-sliders/cover.png)

A joint you add by hand works like one the agent adds: it poses, checks and simulates the same way.
