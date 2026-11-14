---
title: Search every try
date: 2026-11-14
image: /changelog/search-every-try/cover.png
---

You can now search every try from every scene by words and facts. More Like This finds tries that moved the same way.

The Library's search and a new field at the top of Tries take the same query. Thirty tries from a leader arm are easy to scroll. A thousand from five scenes aren't, and the failed grasps on the red block are the ones worth fixing.

A search for "failed grasp red block leader-arm" reads failed and leader-arm as filters. It matches the other words against each try's Case, task, robot, source and input. Dates, durations, robots and servo faults filter the same way. On 10,000 tries, a search took a median of 7 ms.

More Like This is on a try's right-click menu. It compares the path of the part that moves farthest and the joints' speeds, and took 31 ms on the same 10,000 tries.

Words also match what the scene camera saw, through a MobileCLIP model bundled with the app. Basecase embeds about four frames a second in the background. That only covers tries in the open scene, made with its open Case and current robot.

The agent searches the same way with its `search_tries` tool.

Steps are in [Search tries](/help/search-tries).
