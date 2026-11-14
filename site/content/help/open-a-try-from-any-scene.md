---
title: Open a try from any scene
date: 2026-11-13
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

You can open a try you recorded in any scene. Basecase groups tries by robot, and you can step through each one on the timeline.

1. Click **Library** in the view rail on the left.
2. Under **Tries**, click a robot.

![The Library with a robot and its two tries under Tries](/help/open-a-try-from-any-scene/library.png)

3. Tries fills the canvas and shows every try, grouped by robot with the newest first. Each tile shows the Case, whether the try Passed or Missed, and how long it ran. Click a try.

![Tries over the canvas with a try from each of two scenes](/help/open-a-try-from-any-scene/tries.png)

4. The try timeline opens under the tiles, with one lane per joint. Step through it the same way you would in [Scrub a try on the timeline](/help/scrub-a-try-on-the-timeline).

![A selected try with its timeline open](/help/open-a-try-from-any-scene/timeline.png)

5. To close the timeline, press [[Esc]]. To leave Tries, press [[Esc]] again or click **Done**.

You can also press [[⌘K]], then choose **Show Tries**.

To delete tries, hold [[⌘]] or [[⇧]] while you click to select more than one, then press [[⌫]] and click **Delete**. Deleting a try also deletes any Variations that came from it.

**Note:** A try opens on the timeline only if it fits the robot in the open scene. If you click a real try, Basecase selects it but doesn't open the timeline.

To find tries by words, facts or motion, see [Search tries](/help/search-tries).

If you recorded tries before the Library held them, Basecase moves them in the first time you open their scene. On a Mac, Basecase stores tries in `library/tries` inside `~/Library/Application Support/Basecase`, with one folder per try.
