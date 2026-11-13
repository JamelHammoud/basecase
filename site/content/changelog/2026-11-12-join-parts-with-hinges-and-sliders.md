---
title: Join parts with hinges and sliders
date: 2026-11-12
image: /changelog/join-parts-with-hinges-and-sliders/cover.png
---

Select two parts and choose Add Hinge or Add Slider from the right-click menu or ⌘K, and a model you drew elsewhere can be posed and simulated. Until now only the agent could make joints.

## Where it is

Click the part that stays put, then Shift-click the part that moves. Right-click the selection and Add Hinge and Add Slider sit under Union, Subtract and Intersect. They show only when exactly two parts are selected, and ⌘K lists them in the same case.

![The right-click menu for two selected boxes, with Add Hinge and Add Slider under Intersect](/changelog/join-parts-with-hinges-and-sliders/menu.png)

## How the axis is picked

A hinge needs a line to turn about, and a slider a line to run along. When one part already has a pin or shaft that sits in a hole in the other, Basecase finds that pair of round faces and makes the joint straight away. Otherwise the canvas shows a crosshair and waits for you to click a round face on any part: a pin, a shaft, a bore or a servo horn. The joint takes that face's axis. A flat face gives no axis, so the click does nothing, and Esc gives up.

The joint is named after the moving part. A hinge turns 90° each way, and a slider travels as far as the two parts overlap along the axis.

## Posing it

The new joint selects the moving part and opens the Pose tab on it. Drag its slider, type an angle, or drag the ring on the canvas, and only the moving part turns. Each step is on the undo timeline, so ⌘Z takes back the pose and then the joint.

![The Pose tab with the Arm hinge turned to 40° and the ring drawn around the pin](/changelog/join-parts-with-hinges-and-sliders/cover.png)

## Range and Delete

Right-click a joint's row in the Pose tab. Range opens the lower and upper limit fields, in degrees for a hinge and millimetres for a slider. Delete removes the joint at once, with a “Deleted Arm” toast and Undo, the same as deleting a part.

![The joint row's menu with Range open, showing -90° and 90°, and Delete below it](/changelog/join-parts-with-hinges-and-sliders/range.png)

Hand-made joints go through the same builder as the agent's define_joints, so they're stored the same way as the joints it declares.
