---
title: Import robots from GitHub, Hugging Face and zips
date: 2026-11-12
image: /changelog/import-robot-repos-and-zips/cover.png
---

You can now import a published robot from a link to its GitHub or Hugging Face repo, a folder in one, or a zip. Basecase finds the URDF or MJCF inside and inserts the robot with its joints, limits and masses.

A robot repo rarely holds only the robot. Launch files, configs and test worlds sit beside one or more descriptions, and the one you want is a few folders down.

## Where it is

Press ⌘K and choose Import Robot. It's also in File ▸ Import Robot and behind the + at the top of the Robots view. One field takes any of these:

- a GitHub repo, a folder in one, or its Download ZIP link, like `github.com/TheRobotStudio/SO-ARM100`
- a Hugging Face model or dataset repo, a folder, or a single file in one
- a direct link to a `.urdf`, `.xacro`, `.xml` or `.zip`

Press Enter and Basecase reads the repo's file list and fetches only the files it needs. It inserts the robot with its joints, limits and masses, already selected. A toast says how many joints it found, with a Pose button to move them.

![Import Robot with the SO-ARM100 repo's link](/changelog/import-robot-repos-and-zips/link.png)

## When a repo has several robots

Basecase looks for the robot's description itself. It prefers an MJCF model, then a URDF, and ignores ROS package files like launch files, configs and test worlds. If one description is left, it imports. If several sit side by side, as the three SO-101 variants do in SO-ARM100, the sheet lists them: pick one and click Import.

![The three SO-101 models in SO-ARM100, with so101_new_calib.xml picked](/changelog/import-robot-repos-and-zips/choose.png)

A link to a single file in a Hugging Face repo imports that file and nothing else. A link with no robot in it, or a repo that's private or missing, fails with one toast saying so. Repos must be public, and a zip link can be up to 200 MB.

## Xacro packages

Import Robot also opens xacro, so a robot exported from Fusion 360 with fusion2urdf comes in with its joints and limits. So does a ROS description package built from xacro macros. Choose the package folder or paste the repo link. Includes, properties, macros, `xacro:if` and `xacro:arg` defaults are expanded in the app; a plain `.urdf` beside the xacro still wins.

![A desk arm exported with fusion2urdf, inserted with its 2 joints and selected in the scene](/changelog/import-robot-repos-and-zips/fusion-arm.png)

## From your computer

Drag a robot's folder, zip, URDF, xacro or MJCF file onto the canvas and the robot stands where you drop it. Dropped folders are searched the same way as repos, skipping `.git` and `node_modules`. Choose Folder in the Import Robot sheet imports a robot's folder from a file picker instead.

## After it's in

Each piece of the robot with a shape becomes a mesh part. Each revolute or prismatic joint keeps its axis and limits, ready for the Pose tab, Simulate and Operate. Robots imported from a link are remembered in Robots ▸ Imported with a preview, so they're one click away next time, in any scene.

Steps are in [Import a robot](/help/import-a-robot).
