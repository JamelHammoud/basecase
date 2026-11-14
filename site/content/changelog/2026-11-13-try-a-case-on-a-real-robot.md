---
title: Try a Case on a real robot
date: 2026-11-13
image: /changelog/try-a-case-on-a-real-robot/cover.png
---

You can now try a Case on your real robot. Print the Case as a floor mat, and Basecase judges the robot's run on it from a camera.

It works for wheeled and legged robots in the desktop app. Basecase only watches the run.

Export Case Mat is in the open Case's right-click menu and in ⌘K. Try on Real Robot is under Try It.

Until now, a Case could only judge the simulation. A rover could reach its spot in the sim and stop short on the floor, and nothing in Basecase could tell you. Basecase judges a real try by the same contract as the sim, so there's no separate judge to train.

## The Mat

The mat prints true to size on A4 or Letter sheets, with AprilTags on it. Rover's Reach a Spot takes 21 sheets and 6 tags, plus one tag for the top of the robot.

Basecase works out where the camera is from any two tags on the mat, then follows the tag on the robot. Finding the tags and solving takes 1.8 ms per 1280 × 720 frame on an M5 Pro.

If you printed the mat at 97%, Basecase refuses it instead of measuring it wrong.

## What It Doesn't Cover

Basecase tracks only the robot's base, so it doesn't judge arms yet. It assumes the base is level. You can't export a real try in a dataset or multiply it.

Read [Try a Case on your real robot](/help/try-a-case-on-your-real-robot) in the help center for the steps.
