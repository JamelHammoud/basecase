---
title: Search every try
date: 2026-11-14
image: /changelog/search-every-try/cover.png
---

You can now search the tries from every scene by words and facts, and find tries that moved like the one you picked.

The Library's search and a new field at the top of Tries take the same query. More Like This is on a try's right-click menu.

A thousand tries from five scenes are hard to scroll when you want the failed grasps on the red block from the leader arm. Search for "failed grasp red block leader-arm" and Basecase reads failed and leader-arm as filters. The other words match each try's Case, task, robot, source and input. Dates, durations, robot names and servo faults filter too.

More Like This compares the path of the part that moves farthest and the speeds of the joints, across every scene. It only compares robots of the same kind with the same number of joints.

On 10,000 tries, a search took a median of 6 ms and More Like This took 4 ms. Older tries that kept a recording get their motion the first time the search loads.

The agent searches the same way with its `search_tries` tool. The steps are in [Search tries](/help/search-tries).
