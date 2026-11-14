---
title: Search every try
date: 2026-11-14
image: /changelog/search-every-try/cover.png
---

You can now search the tries from every scene by words and facts, and find tries that moved like the one you picked.

The Library's search, a new field at the top of Tries and the agent's `search_tries` tool all take the same query.

Say you have a thousand tries from five scenes, and you want the failed grasps on the red block from the leader arm. Search already matched a try's Case or task, robot and source. You couldn't filter by outcome, input, date or length. Now you type "failed grasp red block leader-arm".

Basecase reads "failed" and "leader-arm" as filters. It does the same with dates such as "last week", lengths such as "over 30 s", robot names and servo faults. Every other word must match the try's Case, task, robot, source or input.

More Like This, on a try's right-click menu, ranks tries from every scene by motion. Basecase compares the path of the part that moves farthest and the speeds of the joints. It skips robots of another kind or with a different number of joints.

On 10,000 tries, a text search took a median of 6.5 ms and More Like This took 3.1 ms.

Tries shows the best 200 matches, and the Library shows the first 20. Search doesn't look inside camera video. The first time search loads, it reads the motion of older tries that kept a recording.

Steps are in [Search tries](/help/search-tries).
