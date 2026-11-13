---
title: Character shells that move
date: 2026-11-13
---

Meshy, Tripo and Hi3D can now split a generated character into printable parts. Those parts make a statue. Disney's BDX droids show what a character robot really needs: shells wrapped around a moving skeleton, each one clear of the motors underneath. That took a team about a year.

Basecase already knows the skeleton: every joint's pivot, axis and range, and every servo and link that moves with it. So today it can do the wrapping. Select a robot and a mesh you imported, choose Wrap Robot, and the mesh becomes one hollow shell per link with a 2 mm wall. Each shell is cut at its joint and cut back wherever a servo, a link or the next shell would hit it anywhere in the joint's range. The shells ride their links, so the robot poses, animates and simulates in its new body, and they print like any other part.

The sweeps are checked over each joint's whole range, not at a few sampled angles. Every surface point is binned by its radius and height around the axis, and a point is cleared if any surface reaches it along the arc it travels.

On the SO-101 arm, a wrap takes about half a minute and gives seven shells, one per link.
