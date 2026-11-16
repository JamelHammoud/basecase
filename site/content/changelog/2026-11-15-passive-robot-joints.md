---
title: Let robot joints move without a motor
date: 2026-11-15
image: /changelog/passive-robot-joints/cover.png
---

You can let robot joints move under gravity and contact without a motor holding them in place. In **Pose**, right-click a joint and choose **Actuation**, then **Passive**.

A free finger on a gripper should fall when its mount turns. Until now, we gave every hinge a motor, which hid that behavior in simulation.

Passive joints keep their axes and limits, along with any declared physical damping and friction. They have no estimated motor resistance or holding torque. You can set their starting positions in **Pose**, then inspect their recorded motion.

Training, live drive and robot package servo maps leave passive joints out of their action channels. A powered shoulder can hold its position while its passive wrist moves. Existing scenes keep their powered behavior until you change it.

Choosing **Passive** clears that joint's motor assignments. The motor parts stay in the scene. This adds no cable or tendon physics, and simulated motion doesn’t establish physical accuracy.

Steps are in [Make a joint passive](/help/make-a-joint-passive).
