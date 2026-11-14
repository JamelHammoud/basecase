---
title: Weight and center of mass
date: 2026-11-13
updated: 2026-11-14
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

The Weight check adds up the weight of every part in your robot and finds its center of mass. Servo torque and standing stability both depend on these results.

To see your robot's total weight and how high its center of mass sits above the floor, open the Build tab and click **Weight** under **Checks**.

## Where each part's weight comes from

The check weighs each kind of part differently:

| Part | Weighed by |
|---|---|
| Imported robot link | The maker's published mass and center of mass |
| Component | Its catalog weight |
| Hardware | Its volume and the density of its finish |
| Printed part | The filament its shell and infill use, at your material and infill settings |
| Part cut from sheet | Its volume at 2.7 g/cm³ for 6061 aluminum, 1.55 g/cm³ for carbon fiber plate or 1.19 g/cm³ for acrylic |
| Off-the-shelf part or stand-in | Its volume at 1.2 g/cm³, an estimate |
| Supply | Its listed weight, or its volume at 1.5 g/cm³ if it has none |

Printed parts start out as PLA at 15% infill. You can change both settings in Print mode. Cutouts, guides and reference images weigh nothing.

The Weight check never fails. If any part's weight is an estimate, the check shows a warning with the number of estimated parts and how much they weigh. Use it to judge how far to trust the total.

## Which parts are the robot

A robot counts its own parts plus any solid within 50 mm of them, so a battery tucked inside the torso belongs to the robot. Anything farther away counts as scenery. So does any object that moves freely in Simulate.

Basecase leaves scenery out of the weight, the leg loads and the footprint, and the Weight row shows how much weight it left out. If you add a table or a second robot to the scene, your robot's results don't change.

## Standing stability

The standing stability check checks that the center of mass sits over the outline of the robot's feet. It reports how far inside that outline the center of mass sits and how far the robot can tilt before it tips over.

| Result | When |
|---|---|
| Pass | The robot can tilt more than 5° before it tips |
| Warn | The robot tips between 2° and 5° of tilt, or rests on a line with no third contact |
| Fail | The center of mass is outside the feet, or the robot tips at under 2° of tilt |

A foot touches the ground wherever its mesh does. A ball touches at a single point, and a wheel touches along a line under its axle. If your robot stands on two wheels and nothing else, the check warns that it has to balance itself.

To make your robot more stable, widen its stance or move heavy parts like the battery lower and over the feet.
