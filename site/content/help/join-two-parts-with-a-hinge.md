---
title: Join two parts with a hinge or slider
date: 2026-11-13
covers:
  - src/workspace/useHandJoints.ts
  - src/workspace/jointCommands.tsx
  - src/joints/axisFinder.ts
  - src/components/PosePanel.tsx
---

Turn two parts of a model you drew or imported into a joint you can pose, check and simulate.

1. Select the part that stays put, then Shift-click the part that moves. The order matters: the first part is the parent, the second turns or slides.
2. Right-click the selection and choose Add Hinge or Add Slider. Both are in ⌘K too.
3. If one part has a shaft sitting in a bore on the other, the joint goes in on that shared axis straight away.
4. Otherwise, click a round face on either part: a shaft, a bore, a rounded edge. The cursor is a crosshair over a round face and shows a no-entry sign anywhere else. Esc stops picking.
5. The Pose tab opens on the new joint. Drag its ring on the canvas, or type an angle in its row, to turn the moving part.

![Add Hinge and Add Slider in the right-click menu for two selected parts](/help/join-two-parts-with-a-hinge/menu.png)

![The Pose tab with the new hinge turned to 40°](/help/join-two-parts-with-a-hinge/pose.png)

A hinge turns ±90° to start with. A slider travels as far as it can while the two parts still overlap along its axis. To change either, right-click the joint's row in the Pose tab and point at Range.

![Range in a joint row's right-click menu, with the lowest and highest angle](/help/join-two-parts-with-a-hinge/range.png)

⌘Z removes a joint you just added. To remove one later, right-click its row in the Pose tab, choose Delete and confirm; ⌘Z brings it back.
