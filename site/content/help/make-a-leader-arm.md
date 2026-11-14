---
title: Make a leader arm
date: 2026-11-13
collection: operate
type: task
covers:
  - src/leader/makeLeader.ts
  - src/leader/leaderArm.ts
  - src/leader/leaderFrames.ts
  - src/leader/leaderCode.ts
  - src/workspace/useLeader.ts
  - src/workspace/leaderCommands.tsx
---

Turn an arm in your scene into a smaller copy you print, wire and move by hand, the way people record demonstrations with an SO-101 or GELLO leader.

1. Open a scene with a fixed-base arm, like the SO-101 from Parts ▸ Robots.
2. Press [[⌘K]] and choose Make a Leader, or right-click any part of the arm and choose Make a Leader.
3. A new tab opens with the arm's name and Leader after it. The leader has the arm's joints in the same order, each turning about the same axis within the same limits.
4. Give the brackets a few seconds: each shows as a box until the CAD kernel has compiled it.
5. Open Build to see its Checks, its bill of materials and its plates.

![Make a Leader in ⌘K, with an SO-101 in the scene](/help/make-a-leader-arm/command.png)

![Make a Leader in the right-click menu of a part of the arm](/help/make-a-leader-arm/menu.png)

![The SO-101 Arm Leader: a base, a link per joint, and a handle with a trigger](/help/make-a-leader-arm/leader.png)

![Build for the leader, with its Checks and bill of materials](/help/make-a-leader-arm/build.png)

Every joint gets a Dynamixel XL330-M288, used only to read its angle, so the bill of materials lists one per joint. The brackets come from the same servo links and bases as the arm template. The last joint carries a handle. If the arm has a gripper, a trigger on the handle is the gripper's joint.

The leader is about half the arm's reach, but no link is shorter than 56 mm, the closest two XL330s can sit. A small arm like the SO-101 comes out nearer 0.6×.

The leader's joints keep the arm's joint ids, and its scene remembers which scene and arm it leads, so its readings can map onto the arm without an offset script. It works on arms whose joints form a single chain, so an arm whose gripper has two finger joints, like the Franka, isn't offered one. The agent can make one too: ask it for a leader for the arm.
