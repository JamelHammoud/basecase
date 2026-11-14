---
title: Hinges and sliders between your own parts
date: 2026-11-13
image: /changelog/hinges-and-sliders/cover.png
---

You can now join two of your own parts with a hinge or a slider.

Select two parts and choose Add Hinge or Add Slider. The second part then turns or slides on the first, and you can pose and simulate it right away.

## Where it is

Select the part that stays put, then Shift-click the part that moves. With exactly two parts selected, Add Hinge and Add Slider show up in the right-click menu for the selection and in ⌘K. The steps are in [Join two parts with a hinge or slider](/help/join-two-parts-with-a-hinge).

![Add Hinge and Add Slider in the right-click menu](/help/join-two-parts-with-a-hinge/menu.png)

## How the axis is found

If one part has a shaft in a bore on the other, Basecase puts the joint straight onto that axis, and you don't need to click anything.

Otherwise, click a round face on either part and Basecase fits a cylinder to it. The cylinder's axis becomes the joint's axis, and its center becomes the pivot. It works the same way on a cylinder from Shapes, a catalog part, an imported mesh or a STEP body.

Flat faces don't give an axis. When you hover over one, the cursor turns into a no-entry sign, and clicking does nothing.

## What you get

The joint takes the moving part's name. A hinge starts at ±90°, and a slider starts with the travel that keeps the two parts overlapping.

The Pose tab opens on the new joint with the moving part selected, and you turn it with the ring on the canvas. Right-click the joint's row for Range or Delete. Press ⌘Z to remove the whole joint in one step.

![The new hinge turned to 40° in the Pose tab](/changelog/hinges-and-sliders/cover.png)

You can pose, check and simulate a joint you add by hand the same way as one the agent adds.
