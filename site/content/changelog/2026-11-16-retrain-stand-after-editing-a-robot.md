---
title: Retrain Stand after editing a robot
date: 2026-11-16
image: /changelog/retrain-stand-after-editing-a-robot/cover.png
---

You can retrain Stand from a compatible policy your robot has proved. Edit the robot, then use the existing Train action.

You can reuse policies in the desktop app with Forge. This works for four-leg and six-leg robots that keep their leg count and have three powered joints per leg. You can also use a six-leg source to train a five-leg target.

Before this change, you had to train from scratch after removing a hexapod leg. Basecase selects one compatible source from the scene's saved skills, maps it onto the edited robot and trains from that input. Basecase leaves the source file unchanged.

For the first warm input, Basecase replaces the ordinary two-minute Stand input with one minute. The remaining trials keep their existing limits. Each new skill needs its own Arena result before it becomes ready. For size and mass edits, use Recheck first if the existing policy fits.

Basecase trains from scratch for other mappings, older records without a source layout, and unreadable source files. Training times depend on the robot and training computer.

Steps are in [Retrain an edited robot](/help/retrain-an-edited-robot).
