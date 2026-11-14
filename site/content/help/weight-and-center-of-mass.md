---
title: Weight and center of mass
date: 2026-11-13
updated: 2026-11-13
collection: engineer
type: concept
order: 4
keywords:
  - mass
  - weight
  - center of gravity
  - centre of mass
  - cog
  - com
  - balance
  - tipping
  - tip over
  - stability
  - support polygon
  - footprint
  - grams
related:
  - servo-torque-and-sizing
  - build-checks
covers:
  - src/utils/engineeringMass.ts
  - src/utils/engineeringBody.ts
  - src/utils/engineeringStability.ts
  - src/utils/engineering.ts
  - src/data/supplies.ts
---

The Weight check adds up every part of your robot and finds its center of mass. Servo torque and standing stability both depend on these results.

To see the robot's total weight and how high its center of mass sits above the floor, click **Weight** under **Checks** in the Build tab.

## Where each part's weight comes from

| Part | Weighed by |
|---|---|
| Imported robot link | The maker's published mass and center of mass |
| Component | Its catalog weight |
| Hardware | Its volume and the density of its finish |
| Printed part | The filament its shell and infill use, at your material and infill settings |
| CNC aluminum | Its volume at 2.7 g/cm³, an estimate |
| Laser-cut sheet | Its volume at 1.4 g/cm³, an estimate |
| Off-the-shelf part or stand-in | Its volume at 1.2 g/cm³, an estimate |
| Supply | Its listed weight, or its volume at 1.5 g/cm³ if it has none |

Printed parts start as PLA at 15% infill. You can change both in Print mode. Cutouts, guides and reference images don't add any weight.

The Weight check never fails. If any part's weight is an estimate, the check shows a warning with how many parts are estimated and what they weigh, so you know how far to trust the total.

## Which parts are the robot

Each robot counts its own parts, plus any solid within 50 mm of them. For example, a battery tucked inside the torso counts toward the robot. Anything farther away is treated as scenery, and so is every object that moves freely in Simulate.

Scenery isn't included in the weight, the leg loads or the footprint, and the Weight row shows how much it left out. Adding a table or a second robot to the scene doesn't change the results.

## Standing stability

Standing stability checks that the center of mass sits over the outline of the robot's feet. It reports how far inside the outline the center of mass is, and how far the robot can tilt before it tips over.

| Result | When |
|---|---|
| Pass | The robot can tilt more than 5° before it tips |
| Warn | The robot tips between 2° and 5° of tilt, or rests on a line with no third contact |
| Fail | The center of mass is outside the feet, or the robot tips at under 2° of tilt |

A foot touches the ground wherever its mesh does. A ball touches at a single point, and a wheel touches along a line under its axle. If a robot stands on two wheels and nothing else, the check warns that the robot has to balance itself.

To make a robot more stable, widen its stance, or move heavy parts like the battery lower and over the feet.
