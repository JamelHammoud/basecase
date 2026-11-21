---
title: Save and merge robot versions
date: 2026-11-16
collection: design
type: task
covers:
  - src/workspace/SceneHistorySheet.tsx
  - src/workspace/VersionComparisonPanel.tsx
  - src/workspace/useSceneVersions.ts
  - src/workspace/versionOperations.ts
---

Save a named version of your design, create a branch to try an alternative and merge selected changes without losing either scene.

For a camera mount trial, a separate branch lets you merge the mount without replacing working leg geometry.

Portable scene exports leave out history and branch links. Versions keep references to local artifacts, but can’t recreate missing files.

## Save and restore

1. On the scene tab, right-click and choose **Scene History**.
2. In **Version name**, enter a name such as Camera baseline.
3. Choose **Save Version**.
4. Close the history sheet with **Close**.
5. Edit the robot.
6. On the scene tab, right-click and choose **Scene History**.
7. Select the named version.
8. Choose **Restore**.

![Scene history with the Camera baseline version selected](/help/save-and-merge-robot-versions/named-version.png)

Basecase saves your current design as another version before restoring. You can use Undo to return to that design, including its project settings and annotations.

You keep your saved history if you close the tab or restart. During agent runs, Basecase saves a baseline before work starts and keeps changed results when the runs finish or stop.

![The restored bracket and camera mount with recoverable versions in history](/help/save-and-merge-robot-versions/restored-version.png)

## Branch and merge

1. In **Scene history**, select a version.
2. Choose **Branch**.
3. On the new scene tab, edit the robot.
4. On the original scene tab, right-click and choose **Scene History**.
5. In **Compare with**, select the branch.
6. Choose **Compare**.
7. Select the parts or joints to merge.
8. For each conflict, choose the design to keep in **Choose a Design**.
9. Choose **Merge Parts**.

![Two linked branches compared with the camera mount removal selected](/help/save-and-merge-robot-versions/compare-branches.png)

![A conflicting bracket edit with a choice of designs](/help/save-and-merge-robot-versions/conflicting-designs.png)

Basecase includes required dependencies with your selection. You keep both branches and their histories after merging.

In Compare, you can view available Checks blockers, cost and weight, bound to each design fingerprint. Basecase runs an active Case for both designs if both robots fit.

Stop the agent before restoring or merging. If you change a design, compare the designs again before merging.

![The merged design with both scene tabs retained](/help/save-and-merge-robot-versions/merged-design.png)

You can open **Scene History** through [[⌘K]]. Choose **Duplicate** to create a linked branch from the current working design.
