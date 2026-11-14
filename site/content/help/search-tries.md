---
title: Search tries
date: 2026-11-14
collection: simulate-and-train
type: task
order: 6
keywords:
  - find tries
  - search episodes
  - segments
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

Find the tries and segments you need from every scene by words, facts like failed or last week, a similar motion, or what a camera saw.

1. Click **Library** in the view rail on the left.
2. Type what you're looking for in the search at the top, such as `failed grasp red block leader-arm`.

![The Library listing two Grasp red block segments for that search](/help/search-tries/library.png)

3. Click a result. Tries fills the canvas with every result, and the timeline opens at the result's start when the try fits the robot in the open scene.

![Tries showing the two failed grasp segments, best match first](/help/search-tries/results.png)

4. To find tries that moved the same way, right-click a try and choose **More Like This**.

![A try's right-click menu with More Like This above Delete](/help/search-tries/menu.png)

5. Tries lists the closest motions first, from every scene.

![Three Lift tries ranked first and a Wave after them, with no walks](/help/search-tries/like.png)

You can also type in the search at the top of Tries.

Words match a try's Case, its task, labels and tags, the robot, and where its input came from. A segment is listed on its own when a word matches its label or its tags.

These words filter instead of matching:

- **Outcome:** passed, failed (or missed) and unjudged.
- **Source and input:** variation, real, keys, gamepad, phone, camera, leader-arm and the other inputs.
- **Robot:** any robot's name, such as SO-101.
- **When:** today, yesterday, this week, last week, this month, last month, or last 3 days.
- **How long:** over 30 s, under 2 min, longer than 10 s.
- **Faulted:** tries where a servo fault was set.

More Like This compares the end effector's path and the joints' speeds. It only compares robots of the same kind with the same number of joints, so an arm's grasp never matches a hexapod's walk.

Words also match what the scene camera saw. Basecase looks at one frame a second of each try in the open scene, the first time you search with words. A match opens the timeline at that second. This works only for tries made with the open Case and the current robot.

To get here from a robot's tries, follow [Open a try from any scene](/help/open-a-try-from-any-scene).
