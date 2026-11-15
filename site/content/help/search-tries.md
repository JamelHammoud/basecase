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
hub_the_design_agent_order: 60
hub_the_design_agent: |
  - Ask for tries, such as failed grasps from last week. It searches the tries from every scene and names the ones that match.
hub_open_a_try_from_any_scene_order: 10
hub_open_a_try_from_any_scene: |
  The search at the top of the Library also finds tries, by words or by facts such as failed or last week. See [Search tries](/help/search-tries). To gather the tries a search finds into a dataset, press [[⌘K]] and choose **Make Dataset**. See [Make a dataset from tries](/help/make-a-dataset-from-tries).
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

After you open a try, click **Close** or press [[Esc]] to go back to the results. You can also search from the field at the top of Tries.

Search keeps the best 200 matches, which can include several segments of one try. Tries shows each matching try once, and the Library shows up to 20 distinct tries.

Your words must all match a try's Case, task, robot, source, input, tags, segment labels or instructions, or the file or repo an [imported try](/help/import-robot-data-as-tries) came from. Some words narrow the list instead. Passed, failed and unjudged pick an outcome. A source or input such as real or leader-arm, or a robot's name, picks where a try came from. Dates such as today or last week, lengths such as over 30 s, and faulted narrow it further.

Words matching a segment's label, instruction or tags keep that segment's frame range. All words must fit the same segment together with the try's details. A dataset made from those results includes only the matching ranges. For example, a grasp segment match leaves out the reach and release frames. Whole-try matches keep the full recording. See [Make a dataset from tries](/help/make-a-dataset-from-tries).

More Like This compares the path of the part that moves farthest and the speeds of the joints. It skips robots of another kind or with a different number of joints, so an arm's grasp won't match a hexapod's walk.

To browse a robot's tries without searching, see [Open a try from any scene](/help/open-a-try-from-any-scene).
