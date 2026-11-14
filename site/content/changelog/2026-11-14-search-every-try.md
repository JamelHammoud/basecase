---
title: Search every try
date: 2026-11-14
image: /changelog/search-every-try/cover.png
---

You can now search the tries from every scene by words and facts, and find tries that moved like the one you picked.

Say you have a thousand tries from five scenes, and you want the failed grasps on the red block from the leader arm. Until now, search matched only a try's Case, robot and source. You couldn't filter by outcome, input, date or length. Now you search for "failed grasp red block leader-arm".

Type a query in the Library's search or in the new field at the top of Tries. Basecase reads it the same way in both, and the agent's `search_tries` tool runs that search too.

## Words and Filters

Basecase reads "failed" and "leader-arm" as filters, and does the same with dates, durations, robot names and servo faults. Every other word is matched against each try's Case, task, robot, source and input.

Tries lists the best 200 matches, and the Library lists the first 20.

## More Like This

Right-click a try and choose More Like This. Basecase compares the path of the part that moves farthest and the speeds of the joints. It looks in every scene, but skips robots of a different kind or with a different number of joints.

## Speed

On 10,000 tries, a text search took a median of 6.5 ms, and More Like This took a median of 3.1 ms.

The first time search loads, it reads the motion of older tries that kept a recording.

Read [Search tries](/help/search-tries) in the help center for the steps.
