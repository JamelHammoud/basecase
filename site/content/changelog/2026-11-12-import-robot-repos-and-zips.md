---
title: Import robots from GitHub, Hugging Face and zips
date: 2026-11-12
---

Import Robot now takes a GitHub or Hugging Face repo or folder link and a zip link, finds the URDF or MJCF inside, and lists the robots when a repo holds several. You can also drop a robot's folder, zip, URDF or MJCF file on the canvas.

## Xacro packages

Import Robot also opens xacro, so a robot exported from Fusion 360 with fusion2urdf, or a ROS description package like the UR arms, comes in with its joints and limits. Choose the package folder or paste the repo link. Includes, properties, macros, `xacro:if` and `xacro:arg` defaults are expanded in the app; a plain `.urdf` beside the xacro still wins.
