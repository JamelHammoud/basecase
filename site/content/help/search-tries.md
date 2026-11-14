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
  - src/workspace/useTryFrames.ts
  - src/cases/trySearch/
---

You can search tries from every scene by words, by facts like failed or last week, by a similar motion, or by what a camera saw.

1. Click **Library** in the view rail on the left.
2. Type what you're looking for in the search at the top. For example, `failed grasp red block leader-arm`.

![The Library listing two Grasp the Red Block tries for that search](/help/search-tries/library.png)

3. Click a result. Tries fills the canvas with every result. If the try fits the robot in the open scene, Basecase opens the timeline at the result's start.

![Tries showing the two missed Grasp the Red Block tries](/help/search-tries/results.png)

4. To find tries that moved the same way, right-click a try and choose **More Like This**. Tries lists tries from every scene, with the closest motions first.

![A try's right-click menu with More Like This above Delete](/help/search-tries/menu.png)

![Three Lift tries ranked first and a Wave after them, with no walks](/help/search-tries/like.png)

You can also search from the top of Tries.

## What your words match

Your words match a try's Case, its task, the robot, and the source of its input. To narrow the list, add any of these words:

- **Outcome:** passed, failed (or missed), and unjudged.
- **Source and input:** variation, real, keys, gamepad, phone, camera, leader-arm, and the other inputs.
- **Robot:** any robot's name, such as SO-101.
- **When:** today, yesterday, this week, last week, this month, last month, or last 3 days.
- **How long:** over 30 s, under 2 min, or at least 10 s.
- **Faulted:** tries with a servo fault set.

## How More Like This compares tries

More Like This compares the path of the part that moves farthest and the speeds of the joints. It skips robots of a different kind or with a different number of joints, so an arm's grasp can't match a hexapod's walk.

## Search what the camera saw

When you search with words, Basecase also checks what the scene camera saw. The first time you search, it looks at one frame a second of each try in the open scene. If a frame matches, Basecase opens the timeline at that second.

**Note:** Camera search needs tries made with the open Case and the current robot.

To get here from a robot's tries, see [Open a try from any scene](/help/open-a-try-from-any-scene).
