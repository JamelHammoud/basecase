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
  - keep-a-robot-session-as-a-try
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

3. Tries fills the canvas and shows every try, grouped by robot with the newest first. Each tile shows the Case, whether the try Passed or Missed, and how long it ran. An imported try shows its task and the file or repo it came from instead, and a session on a connected robot shows the time it started. An amber warning mark flags a try with a problem, such as a joint at its limit. Click a try to open it.

![Tries over the canvas with a try from each of two scenes](/help/open-a-try-from-any-scene/tries.png)

4. The try plays through its Case's console, and the try timeline appears under the canvas. Tries stays hidden until you close the try. To step through the try, follow the steps in [Play a try through its console](/help/play-a-try-through-its-console).

![A try from Tries playing through the Touch the Dots console, with its timeline under the canvas](/help/open-a-try-from-any-scene/timeline.png)

5. To stop playing, click **Done** or press [[Esc]]. Tries comes back.
6. To leave Tries, click **Done** or press [[Esc]] again.

Or open Tries from the command menu. Press [[⌘K]], then choose **Show Tries**.

Saved camera videos play at the timeline's playhead. Detection runs on those frames even while paused, and its results stay with this scene's playback. See [Watch what the robot's cameras see](/help/watch-what-the-robots-cameras-see).

The search at the top of the Library also finds tries, by words or by facts such as failed or last week. See [Search tries](/help/search-tries). To gather the tries a search finds into a dataset, press [[⌘K]] and choose **Make Dataset**. See [Make a dataset from tries](/help/make-a-dataset-from-tries).

To tag tries or mark an imported try passed or failed, right-click it. See [Label a try](/help/label-a-try).

In a dataset, saved versions show their frozen samples. If a saved version is selected, choose **Working Dataset** in **Dataset version** before opening or editing a try. Saved versions don't open the try timeline or its right-click menu.

To delete tries, select them, press [[⌫]], then click **Delete**. Hold [[⌘]] or [[⇧]] while you click to select more than one try. Deleting a try also deletes any Variations that came from it.

**Note:** A try opens on the timeline only if it fits the robot in the open scene. If a try's Case isn't in the open scene, or it's an imported try with no Case, the try plays through the default cards, titled with the robot's name. A try imported from a ROS recording adds a column of cards for its topics. See [Play a ROS recording's topics in the console](/help/play-a-ros-recordings-topics-in-the-console). Clicking a real try selects it but doesn't open the timeline.

If you recorded tries before the Library held them, Basecase moves them into the Library the first time you open their scene. On a Mac, Basecase stores tries in `library/tries` inside `~/Library/Application Support/Basecase`, with one folder per try.
