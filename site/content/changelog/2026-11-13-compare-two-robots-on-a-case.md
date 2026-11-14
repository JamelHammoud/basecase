---
title: Compare two robots on a Case
date: 2026-11-13
image: /changelog/compare-two-robots-on-a-case/cover.png
---

You can now run one Case on two versions of a robot, each open in its own tab, and see which one passes more often. Beside each robot's pass count you see its cost and mass.

Right-click the open Case in the Cases list and choose **Compare With**, or find it in ⌘K. The list shows only the other open scenes whose robot fits the Case.

Until now, choosing a gripper or a servo meant opening each tab and trying the Case once in each. A single clean run doesn't show how a design copes when the floor or a servo is a little off. On Reach a Spot, our test rover passed 20 of 20, and a copy with 0.075 N·m wheel motors passed none.

## Same Runs for Both

Both robots get the same 20 runs. In each run, friction, weight, servo strength and servo delay change a little.

The two rows sit at the top of the Results section, and the higher count is in blue. Under each name you see the bill of materials estimate and the mass from the Weight check. Click the other row to open its tab with the Case.

Ask the agent which robot is better, and it answers with the same runs.

## What Doesn't Compare

Compare only works on Cases that have one robot. The cost leaves out support filament.

Read [Compare two robots on a Case](/help/compare-two-robots-on-a-case) in the help center for the steps.
