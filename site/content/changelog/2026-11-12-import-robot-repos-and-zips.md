---
title: Import robots from GitHub, Hugging Face and zips
date: 2026-11-12
image: /changelog/import-robot-repos-and-zips/cover.png
---

Import Robot now takes a GitHub or Hugging Face repo or folder link and a zip link, finds the URDF or MJCF inside, and lists the robots when a repo holds several. You can also drop a robot's folder, zip, URDF or MJCF file on the canvas.

## Where it is

Press ⌘K and choose Import Robot. It's also in File ▸ Import Robot and behind the + at the top of the Robots view. One field takes any of these:

- a GitHub repo, a folder in one, or its Download ZIP link, like `github.com/TheRobotStudio/SO-ARM100`
- a Hugging Face model or dataset repo, a folder, or a single file in one
- a direct link to a `.urdf`, `.xml` or `.zip`

Press Enter and Basecase reads the repo's file list, fetches only the files it needs, and inserts the robot with its joints, limits and masses, already selected, with a toast that says how many joints it found and a Pose button to move them.

![Import Robot with the SO-ARM100 repo's link](/changelog/import-robot-repos-and-zips/link.png)

## When a repo has several robots

Basecase looks for the robot's description itself. It prefers an MJCF model, then a URDF, and ignores ROS package files like launch files, configs and test worlds. If one description is left, it imports. If several sit side by side, as the three SO-101 variants do in SO-ARM100, the sheet lists them: pick one and click Import.

![The three SO-101 models in SO-ARM100, with so101_new_calib.xml picked](/changelog/import-robot-repos-and-zips/choose.png)

A link to a single file in a Hugging Face repo imports that file and nothing else. A link with no robot in it, or a repo that's private or missing, fails with one toast that names the link.

## From your computer

Drag a robot's folder, zip, URDF or MJCF file onto the canvas and the robot stands where you drop it. Folders are searched the same way as repos, skipping `.git` and `node_modules`. Choose Folder in the Import Robot sheet does the same as a drop.

## After it's in

Each piece of the robot with a shape becomes a mesh part, and each revolute or prismatic joint keeps its axis and limits, ready for the Pose tab, Simulate and Operate. Robots ▸ Imported remembers the file it read with a preview, so the robot is one click away next time, in any scene.
