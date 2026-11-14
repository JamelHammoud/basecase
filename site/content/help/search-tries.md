---
title: Search tries
date: 2026-11-14
collection: simulate-and-train
type: task
order: 6
keywords:
  - find tries
  - search episodes
  - similar motion
  - more like this
  - filter tries
related:
  - open-a-try-from-any-scene
  - scrub-a-try-on-the-timeline
covers:
  - src/components/LibraryPanel.tsx
  - src/components/library/TriesSection.tsx
  - src/components/tries/
  - src/workspace/useTriesView.ts
  - src/workspace/useTrySearch.ts
  - src/cases/trySearch/
---

You can search the tries in all your scenes at once: by words, by details such as failed or last week, or for tries with a similar motion.

1. Click **Library** in the view rail on the left.
2. Type your search in the field at the top, such as `failed grasp red block leader-arm`.

![The Library listing two Grasp the Red Block tries for that search](/help/search-tries/library.png)

3. Click a result to open Tries with the results. If the try fits the robot in the open scene, it plays through its Case's console first.

![Tries showing the two missed Grasp the Red Block tries](/help/search-tries/results.png)

4. To find tries that moved the same way, right-click a try and choose **More Like This**. Tries lists tries from every scene, with the closest motion at the top.

![A try's right-click menu with More Like This above Delete](/help/search-tries/menu.png)

![Three Lift tries ranked first and a Wave after them, with no walks](/help/search-tries/like.png)

After you open a try, click **Close** or press [[Esc]] to go back to the results. You can also search from the field at the top of Tries. Tries shows the best 200 matches, and the Library shows the first 20.

## What your words match

Search looks for your words in a try's Case, task, robot, source and input, and in the file or repo an [imported try](/help/import-robot-data-as-tries) came from. Add any of these words to narrow the list:

- **Outcome:** passed, failed (or missed), and unjudged.
- **Source and input:** variation, real, keys, gamepad, phone, camera, leader-arm, or any other input.
- **Robot:** the name of any robot, like SO-101.
- **When:** today, yesterday, this week, last week, this month, last month, or last 3 days.
- **How long:** over 30 s, under 2 min, or at least 10 s.
- **Faulted:** tries that had a servo fault.

## How More Like This compares tries

More Like This compares the path of the part that moves the farthest and the speeds of the joints. It skips robots of a different kind or with a different number of joints, so an arm's grasp won't match a hexapod's walk.

To browse a robot's tries without searching, see [Open a try from any scene](/help/open-a-try-from-any-scene).
