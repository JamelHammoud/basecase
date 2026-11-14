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

You can turn an arm in your scene into a smaller copy that you print, wire and move by hand. Use it to record demonstrations the way you would with an SO-101 or GELLO leader.

1. Open a scene with a fixed-base arm, like the SO-101 from **Parts** ▸ **Robots**.
2. Press [[⌘K]] and choose Make a Leader. Or right-click any part of the arm and choose Make a Leader.
3. A new tab opens, named after the arm with Leader at the end. The leader has the same joints as the arm, in the same order. Each joint turns about the same axis, within the same limits.
4. Wait a few seconds while the CAD kernel compiles the brackets. Until it does, each bracket shows as a box.
5. Open Build to see the leader's Checks, bill of materials and plates.

![Make a Leader in ⌘K, with an SO-101 in the scene](/help/make-a-leader-arm/command.png)

![Make a Leader in the right-click menu of a part of the arm](/help/make-a-leader-arm/menu.png)

![The SO-101 Arm Leader: a base, a link per joint, and a handle with a trigger](/help/make-a-leader-arm/leader.png)

![Build for the leader, with its Checks and bill of materials](/help/make-a-leader-arm/build.png)

Each joint gets a Dynamixel XL330-M288, which the leader uses only to read the joint's angle. The bill of materials lists one for each joint. The brackets come from the same servo links and bases as the arm template. The last joint carries a handle. If the arm has a gripper, the trigger on the handle is the gripper's joint.

A leader has about half the arm's reach. No link is shorter than 56 mm, because two XL330s can't sit any closer than that. For a small arm like the SO-101, the leader comes out nearer 0.6×.

The leader's joints keep the arm's joint ids, and its scene remembers which scene and arm it leads. You can map its readings onto the arm without an offset script.

Make a Leader needs an arm whose joints form a single chain. You won't see it offered for an arm with two finger joints in its gripper, like the Franka.

You can also ask the agent to make a leader for the arm.
