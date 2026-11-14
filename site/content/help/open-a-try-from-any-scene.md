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

Find a try you recorded in any scene, grouped by robot, and step through it on the timeline.

1. Click **Library** in the view rail on the left.
2. Under **Tries**, click a robot.

![The Library with a robot and its two tries under Tries](/help/open-a-try-from-any-scene/library.png)

3. Tries fills the canvas, with every try grouped by robot, newest first. Each tile shows the Case, Passed or Missed, how long the try ran, and the try's tags. A warn mark lists what may be wrong with the recording, such as a joint at its limit. Click a try.

![Tries over the canvas with a passed try tagged slow grasp](/help/open-a-try-from-any-scene/tries.png)

4. The try timeline opens under the tiles, with the try's segments over one lane per joint. Step through it as in [Scrub a try on the timeline](/help/scrub-a-try-on-the-timeline).

![A selected try with its timeline open](/help/open-a-try-from-any-scene/timeline.png)

5. Press [[Esc]] to close the timeline, then [[Esc]] or click **Done** to leave Tries.

You can also press [[⌘K]] and choose **Show Tries**.

To delete tries, hold [[⌘]] or [[⇧]] while you click to select more, then press [[⌫]] and click **Delete**. To tag them all at once, right-click one and choose **Tag…**, as [Label the segments of a try](/help/label-the-segments-of-a-try) shows. Variations go with the try they came from.

A try opens on the timeline only when it fits the robot in the open scene. A real try never opens there; clicking it only selects it. The search at the top of the Library matches a try's Case, its robot, and the Variation or Real label on its tile.

Tries recorded before the Library held them move in the first time you open their scene. On a Mac they live in `library/tries` inside `~/Library/Application Support/Basecase`, one folder per try.
