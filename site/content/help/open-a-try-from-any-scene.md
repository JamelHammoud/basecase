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

You can open any try you've recorded from any scene and step through it on the timeline.

1. Click **Library** in the view rail on the left.
2. Under **Tries**, click a robot.

![The Library with a robot and its two tries under Tries](/help/open-a-try-from-any-scene/library.png)

3. Tries fills the canvas with every try, grouped by robot with the newest first. Each tile shows the Case, whether the try Passed or Missed, and how long it ran. An imported try's tile shows the task and the file or repo it came from instead. Click a try to open it.

![Tries over the canvas with a try from each of two scenes](/help/open-a-try-from-any-scene/tries.png)

4. The try plays through its Case's console, and the try timeline appears under the canvas. Tries stays hidden until you close the try. To step through the try, see [Play a try through its console](/help/play-a-try-through-its-console).

![A try from Tries playing through the Touch the Dots console, with its timeline under the canvas](/help/open-a-try-from-any-scene/timeline.png)

5. To stop playing the try, click **Done** or press [[Esc]]. Tries comes back.
6. To leave Tries, click **Done** or press [[Esc]] again.

To open Tries from the command menu, press [[⌘K]] and choose **Show Tries**.

To find tries by words, facts or motion, use the search at the top of the Library or of Tries. Search matches a try's Case or task, its robot and its source, plus the file or repo an imported try came from. See [Search tries](/help/search-tries).

To delete tries, select them, press [[⌫]], then click **Delete**. To select more than one, hold [[⌘]] or [[⇧]] while you click. When you delete a try, Basecase also deletes the Variations that came from it.

**Note:** A try opens on the timeline only if it fits the robot in the open scene. If the open scene doesn't have the try's Case, or the try is imported and has no Case, the try plays through the default cards with the robot's name as its title. Clicking a real try selects it but doesn't open the timeline.

Tries you recorded before the Library held them move into the Library the first time you open their scene. On a Mac, Basecase stores tries in `library/tries` inside `~/Library/Application Support/Basecase`, with one folder per try.
