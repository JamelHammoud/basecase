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

The Library holds the tries you recorded in all your scenes, grouped by robot. You can open a try from any scene and step through it on the timeline.

1. Click **Library** in the view rail on the left.
2. Under **Tries**, click a robot.

![The Library with a robot and its two tries under Tries](/help/open-a-try-from-any-scene/library.png)

3. Tries fills the canvas and shows all your tries, grouped by robot with the newest first. Each tile shows the try's Case, whether it Passed or Missed, how long it ran, and its tags. A warn mark lists anything that may be wrong with the recording, such as a joint at its limit. Click a try.

![Tries over the canvas with a passed try tagged slow grasp](/help/open-a-try-from-any-scene/tries.png)

4. The try timeline opens under the tiles, with the try's segments above one lane for each joint. Step through the try as you would in [Scrub a try on the timeline](/help/scrub-a-try-on-the-timeline).

![A selected try with its timeline open](/help/open-a-try-from-any-scene/timeline.png)

5. To close the timeline, press [[Esc]]. To leave Tries, press [[Esc]] again or click **Done**.

**Note:** A try opens on the timeline only if it fits the robot in the open scene. If you click a real try, Basecase selects it but doesn't open the timeline.

You can also open Tries from the command menu. Press [[⌘K]], then choose **Show Tries**.

To select more than one try, hold [[⌘]] or [[⇧]] while you click. To delete tries, select them, press [[⌫]], then click **Delete**. Deleting a try also deletes any Variations that came from it.

To tag several tries at once, select them, right-click one, then choose **Tag**. For the steps, see [Label the segments of a try](/help/label-the-segments-of-a-try).

The search at the top of the Library matches a try's Case, its robot, and the Variation or Real label on its tile.

If you recorded tries before the Library held them, Basecase moves them into the Library the first time you open their scene. On a Mac, each try has its own folder in `library/tries`, inside `~/Library/Application Support/Basecase`.
