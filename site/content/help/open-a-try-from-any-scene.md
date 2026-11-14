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
  - play-a-try-through-its-console
covers:
  - src/workspace/viewCommands.tsx
  - src/components/LibraryPanel.tsx
  - src/components/library/TriesSection.tsx
  - src/components/tries/
  - src/workspace/useTriesView.ts
  - src/workspace/useCaseRun.ts
  - src/cases/tryStore/
  - electron/library/tryStore.mjs
---

You can open any try you've recorded from any scene, then step through it on the timeline.

1. Click **Library** in the view rail on the left.
2. Under **Tries**, click a robot.

![The Library with a robot and its two tries under Tries](/help/open-a-try-from-any-scene/library.png)

3. Tries fills the canvas and lists every try, grouped by robot, newest first. Each tile shows the Case, whether the try Passed or Missed, and how long it ran. Imported tries show their task and the file or repo they came from instead. Click a try to open it.

![Tries over the canvas with a try from each of two scenes](/help/open-a-try-from-any-scene/tries.png)

4. The try plays through its Case's console, and the try timeline appears under the canvas. Tries stays hidden until you close the try. To step through the try, see [Play a try through its console](/help/play-a-try-through-its-console).

![A try from Tries playing through the Touch the Dots console, with its timeline under the canvas](/help/open-a-try-from-any-scene/timeline.png)

5. To stop playing, click **Done** or press [[Esc]]. Tries comes back.
6. To leave Tries, click **Done** or press [[Esc]] again.

To open Tries from the command menu, press [[⌘K]], then choose **Show Tries**.

To find tries by words, facts or motion, use the search at the top of the Library or of Tries. Search looks at a try's Case or task, its robot, its source, and the file or repo an imported try came from. See [Search tries](/help/search-tries).

To delete tries, select them, press [[⌫]], then click **Delete**. To select more than one try, hold [[⌘]] or [[⇧]] while you click. Deleting a try also deletes any Variations that came from it.

**Note:** A try opens on the timeline only if it fits the robot in the open scene. If the try's Case isn't in the open scene, or it's an imported try with no Case, the try plays through the default cards and uses the robot's name as its title. Clicking a real try selects it but doesn't open the timeline.

If you recorded tries before the Library held them, Basecase moves them into the Library the first time you open their scene. On a Mac, Basecase stores tries in `library/tries` inside `~/Library/Application Support/Basecase`, with one folder per try.
