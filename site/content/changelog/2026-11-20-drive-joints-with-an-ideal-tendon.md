---
title: Drive joints with an ideal tendon
date: 2026-11-20
image: /changelog/drive-joints-with-an-ideal-tendon/cover.png
---

You can connect a catalog motor spool to passive robot joints and run the transmission in Simulate. You can model ideal coupling without physical cable measurements.

In Pose, right-click the motor joint and choose **Edit Tendon**. You can make the same declaration through the design agent.

For a remote elbow, you can keep the motor in the base and drive the elbow through the transmission. For shared fingers, you can use one motor without assigning each joint a fixed displacement ratio.

You connect the spool to up to 32 passive outputs with signed coefficients, then use a fixed length constraint or a declared elastic law to transfer load across the coordinates. You keep the motor's catalog limits and any supplied dynamics.

Save records one undo step. You retain the declaration in scene files, Library assemblies and recordings. In recordings, you keep motor actions separate from physical joint observations.

At launch, you can use ideal fixed tendons. You cannot model spatial routing, slack or durability. You cannot use these declarations for training, IK or hardware deployment. In Robot Package exports, you retain MJCF physics and get an explicit marker for the unsupported URDF extension.

Steps are in [Drive joints with an ideal tendon](/help/drive-joints-with-an-ideal-tendon).
