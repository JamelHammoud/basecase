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

The Weight check adds up every part of the robot and finds its center of mass, which servo torque and standing stability both build on.

Click **Weight** under **Checks** in the Build tab to see the robot's total weight and how high the center of mass sits above the floor.

## Where each part's weight comes from

| Part | Weighed by |
|---|---|
| Imported robot link | The maker's published mass and center of mass |
| Component | Its catalog weight |
| Hardware | Its volume and the density of its finish |
| Printed part | The filament it takes, shell and infill, in your material and infill |
| CNC aluminum | Its volume at 2.7 g/cm³, an estimate |
| Laser-cut sheet | Its volume at 1.4 g/cm³, an estimate |
| Off-the-shelf part or stand-in | Its volume at 1.2 g/cm³, an estimate |
| Supply | Its listed weight, else its volume at 1.5 g/cm³ |

Printed parts start as PLA at 15% infill; change both in Print mode. Cutouts, guides and reference images weigh nothing.

Weight never fails. It warns when any part is an estimate, with how many and what they weigh, so you know how far to trust the total.

## Which parts are the robot

Each robot counts its own parts, plus any solid within 50 mm of them, so a battery tucked inside the torso counts. Anything farther away is scenery, and so is every object that moves freely in Simulate.

Scenery stays out of the weight, the leg loads and the footprint, and the Weight row names how much it left out. A table or a second robot changes nothing.

## Standing stability

Standing stability checks that the center of mass sits over the outline of the feet. It reports how far inside the outline it is, and the tilt that would tip the robot over.

| Result | When |
|---|---|
| Pass | It tips only past 5° |
| Warn | It tips between 2° and 5°, or rests on a line with no third contact |
| Fail | The center of mass is outside the feet, or it tips under 2° |

A foot touches where its mesh does. A ball touches at a point, and a wheel along a line under its axle. A robot on two wheels and nothing else warns that it has to balance itself.

To steady a robot, widen its stance, or move heavy parts like the battery lower and over the feet.
