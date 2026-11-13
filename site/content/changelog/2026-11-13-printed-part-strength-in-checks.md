---
title: Printed part strength in Checks
date: 2026-11-13
image: /changelog/printed-part-strength-in-checks/cover.png
---

A new Strength row in Checks tells you whether each printed part between a servo and the next joint survives that joint's load. Fix turns a weak part onto the face where it's strongest.

## Where it is

Strength sits in Checks in the Build tab, with the other engineering checks. Each part it flags reads like "L Bracket: 1.2×, 0.77 N·m (Shoulder pitch)": it can take 1.2 times the shoulder's 0.77 N·m before it cracks. At 2× or more a part passes, and under 1.3× it fails. A failure is a blocker, so the design isn't Ready to build until it's fixed or you ignore it. While the row is open, the canvas paints each checked part from blue through amber to red where it would crack first.

![Strength failing an L-bracket printed with its layers across the bend](/changelog/printed-part-strength-in-checks/fails.png)

## How it works

Checks already knew the loads: the crouch or hold torque from Servo torque, or the walking peak once Peak torque has run. It also knew which screws hold each part, and how each part will lie on the plate. Strength follows the screws from each servo horn to the next joint and turns every printed part on that path into about 1.5 mm cubes. It holds the part at the horn, pushes on the screws that carry the next link, and solves for the stress in a background worker. A 3 mm bracket takes about half a second.

The plastic is modeled the way a printer lays it down. PLA holds about 50 MPa along a layer but only 25 MPa pulling layers apart, and PETG 45 and 30. Your infill and the walls the slicer lays down decide how much of each part is solid. Strength grades the part on the face Printing picked for it, and on every other face it could lie on.

## Fix

When another face is more than 10% stronger, Fix sets it, with no agent involved, and Strength checks again on its own. The same L-bracket turned on its side goes from 1.2× to 2.1×.

![After Fix, the bracket lies on its side and Strength passes at 2.1×](/changelog/printed-part-strength-in-checks/passes.png)

## What it doesn't check yet

Strength only checks parts between a servo horn and the next joint. A foot, a gripper finger or a part held by glue isn't checked. It doesn't read stress within 3 mm of a screw, since the cubes can't show how a screw head spreads its load. It doesn't cover falls, impacts or wear over many cycles either.

Steps are in [Check printed parts are strong enough](/help/check-printed-parts-are-strong-enough).
