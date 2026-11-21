---
title: Save robot versions and merge alternatives
date: 2026-11-16
image: /changelog/save-robot-versions/cover.png
---

You can save named robot versions, branch alternatives and merge selected edits into another scene. You can recover both designs and their histories.

Scene History opens from the scene tab's menu or the command palette. Duplicate creates a linked branch through the same history.

Try a camera mount on a robot with working leg geometry. Keep the trial separate, then merge the mount and its dependencies back into the original scene.

In Compare, you can see available Checks blockers, cost and weight alongside each design's fingerprint. If both robots fit the active Case, use the existing Compare With path to run it for both.

Merging selected parts includes their required joints, mates and project dependencies. You need to choose between conflicting edits. If you change a design, compare it again before merging.

The agent saves a baseline before each run starts. You can recover changed results after the run finishes, after an interruption or after you close the tab. You keep the current design when you restore or merge, and you can use Undo afterward.

You keep history on your machine. Portable scene exports leave out versions, branch links and local artifact files. In a saved version, you preserve references without gaining fresh readiness evidence.

Follow the steps in [Save and merge robot versions](/help/save-and-merge-robot-versions).
