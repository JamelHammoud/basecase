---
title: Import robots from GitHub, Hugging Face and zips
date: 2026-11-12
image: /changelog/import-robot-repos-and-zips/cover.png
---

You can now import a published robot from a link to its GitHub or Hugging Face repo, a folder in one, or a zip. Basecase finds the URDF or MJCF inside and inserts the robot with its joints, limits and masses.

A robot repo rarely holds only the robot. Launch files, configs and test worlds sit beside one or more descriptions, and the one you want is a few folders down.

Paste the link into Import Robot, in ⌘K, the File menu or the + in the Robots view. Basecase skips ROS launch, config and world files and prefers an MJCF over a URDF. When a repo holds several robots, it lists them so you pick one.

![Import Robot listing two arms found in one repo](/changelog/import-robot-repos-and-zips/choose.png)

You can also drop a robot's folder, zip, URDF or MJCF file on the canvas. The robot stands where you drop it.

Repos must be public. A zip link can be up to 200 MB. Xacro files aren't expanded, so a robot published only as xacro won't import.

Steps are in [Import a robot](/help/import-a-robot).
