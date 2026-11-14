---
title: Search every try
date: 2026-11-14
image: /changelog/search-every-try/cover.png
---

You can now search the tries from every scene by words and facts, and find tries that moved like the one you picked.

Type a query in the Library's search or in the new field at the top of Tries. Both read it the same way. Right-click a try for More Like This.

## Search by Words and Facts

Say you have a thousand tries from five scenes and you want the failed grasps on the red block from the leader arm. Instead of scrolling, search for "failed grasp red block leader-arm".

Basecase reads failed and leader-arm as filters and matches the other words against each try's Case, task, robot, source and input.

Dates, durations, robot names and servo faults work as filters too.

## More Like This

More Like This compares the path of the part that moves farthest and the speeds of the joints. It searches every scene, but it only matches a try against robots of the same kind with the same number of joints.

## Fast on Big Libraries

On 10,000 tries, a search took a median of 6 ms and More Like This took 4 ms.

The first time the search loads, Basecase reads the motion of older tries that kept a recording.

The agent searches the same way, with its `search_tries` tool.

Read [Search tries](/help/search-tries) in the help center for the steps.
