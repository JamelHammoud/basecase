---
title: Open a try from any scene
date: 2026-11-13
updated: 2026-11-14
collection: simulate-and-train
type: task
order: 5
keywords:
  - all tries
  - recordings
  - episodes
  - demonstrations
  - delete tries
  - library
related:
  - try-a-case
  - scrub-a-try-on-the-timeline
covers:
  - src/workspace/viewCommands.tsx
  - src/components/LibraryPanel.tsx
  - src/components/library/TriesSection.tsx
  - src/components/tries/
  - src/workspace/useTriesView.ts
  - src/cases/tryStore/
  - electron/library/tryStore.mjs
---

The Library holds every try you record, from any scene, grouped by robot. Open a try there to step through it on the timeline.

1. Click **Library** in the view rail on the left.
2. Under **Tries**, click a robot.

![The Library with a robot and its two tries under Tries](/help/open-a-try-from-any-scene/library.png)

3. Tries fills the canvas and shows every try grouped by robot, with the newest first. Each tile shows the Case, whether the try Passed or Missed, and how long it ran. An imported try shows its task and the file or repo it came from. Click a try to select it.

![Tries over the canvas with a try from each of two scenes](/help/open-a-try-from-any-scene/tries.png)

4. The try timeline opens under the tiles, with one lane for each joint. Step through it the same way as in [Scrub a try on the timeline](/help/scrub-a-try-on-the-timeline).

![A selected try with its timeline open](/help/open-a-try-from-any-scene/timeline.png)

5. Press [[Esc]] to close the timeline. To leave Tries, press [[Esc]] again or click **Done**.

You can also open Tries by pressing [[⌘K]] and choosing **Show Tries**.

To delete tries, select them and press [[⌫]], then click **Delete**. Hold [[⌘]] or [[⇧]] while you click to select more than one try. Deleting a try also deletes any Variations that came from it.

**Note:** A try opens on the timeline only if it fits the robot in the open scene. If you click a real try, it's selected but the timeline doesn't open.

The search at the top of the Library finds tries by Case or task, by robot, and by the Variation or Real label or the file or repo shown on the tile.

If you recorded tries before the Library held them, Basecase moves them into the Library the first time you open their scene. On a Mac, Basecase stores tries in `library/tries` inside `~/Library/Application Support/Basecase`, with one folder for each try.
