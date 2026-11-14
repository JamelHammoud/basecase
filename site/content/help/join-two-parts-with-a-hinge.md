---
title: Join two parts with a hinge or slider
date: 2026-11-13
collection: engineer
type: task
keywords:
  - joint
  - hinge
  - slider
  - axis
covers:
  - src/workspace/useHandJoints.ts
  - src/workspace/jointCommands.tsx
  - src/joints/axisFinder.ts
  - src/joints/jointCandidates.ts
  - src/components/PosePanel.tsx
---

You can turn two parts of a model you drew or imported into a joint, then pose, check and simulate it.

1. Select the part that stays put, then Shift-click the part that moves. The first part you select becomes the parent, and the second part turns or slides.
2. Right-click the selection and choose Add Hinge or Add Slider. You can also find both in [[⌘K]].
3. If one part has a shaft sitting in a bore on the other, Basecase adds the joint on that shared axis right away.
4. If not, click a round face on either part, such as a shaft, a bore or a rounded edge. The pointer changes to a crosshair over a round face and shows a no-entry sign anywhere else. To stop picking, press [[Esc]].
5. The Pose tab opens on the new joint. To turn the moving part, drag the joint's ring on the canvas or type an angle in its row.

![Add Hinge and Add Slider in the right-click menu for two selected parts](/help/join-two-parts-with-a-hinge/menu.png)

![The Pose tab with the new hinge turned to 40°](/help/join-two-parts-with-a-hinge/pose.png)

By default, a hinge turns ±90°. A slider travels as far as it can while the two parts still overlap along its axis. To change either range, right-click the joint's row in the Pose tab and point at Range.

![Range in a joint row's right-click menu, with the lowest and highest angle](/help/join-two-parts-with-a-hinge/range.png)

To join every part of an imported assembly at once, ask the agent, for example “Make this a robot.” The agent finds each shaft or pin turning in a bore, adds those joints, then turns each joint through its range to check for collisions. Parts bolted together on two or more pins stay fixed. The agent doesn't find rails or dovetails, so add those sliders by hand.

To undo a joint you added a moment ago, press [[⌘Z]]. To remove a joint later, right-click its row in the Pose tab, choose Delete, then confirm. Press [[⌘Z]] to bring it back.
