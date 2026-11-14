---
title: Try a Case on a real robot
date: 2026-11-13
image: /changelog/try-a-case-on-a-real-robot/cover.png
---

You can now print a Case as a floor mat and judge your real robot's run on it from a camera. It works for wheeled and legged robots in the desktop app, and Basecase only watches.

Export Case Mat is in the open Case's right-click menu and ⌘K. Try on Real Robot sits under Try It.

Until now, a Case could only judge the simulation. A rover that reached its spot in the sim might stop short on the floor, and nothing in Basecase could say so. A real try is judged by the same contract, with no separate judge to train.

The mat is true-size A4 or Letter sheets with AprilTags. Rover's Reach a Spot takes 21 sheets and 6 tags, plus a tag for the robot's top. The camera works out where it is from any two mat tags, then follows the robot's tag. Finding the tags and solving takes 1.8 ms per 1280 × 720 frame on an M5 Pro. A mat printed at 97% is refused rather than mis-measured.

Only the robot's base is tracked, so arms aren't judged yet. The base is taken to be level. A real try can't be exported in a dataset or multiplied.

Steps are in [Try a Case on your real robot](/help/try-a-case-on-your-real-robot).
