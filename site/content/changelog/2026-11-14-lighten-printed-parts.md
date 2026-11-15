---
title: Lighten printed parts
date: 2026-11-14
image: /changelog/lighten-printed-parts/lighten.png
---

You can now remove material from a printed part using the loads and mounting points in your robot. Right-click a printed solid and choose **Lighten**, or select it and use [[⌘K]].

A bracket between two joints carries the parts beyond it. Lighten uses that load to choose where material stays, with the regions around its mounts protected.

Target mass starts at 50% of the original, and the minimum wall starts at 1.5 mm under Expert. The calculation runs in a background worker, then replaces the shape in one undoable edit. If it can’t produce a result, the original stays in place and the dialog says why.

The part needs a measured Strength load path. Mounting regions and the wall setting can keep it above the target mass. Review Checks after the edit before printing.

Steps are in [Lighten a printed part](/help/lighten-a-printed-part).
