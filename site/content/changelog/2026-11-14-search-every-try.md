---
title: Search every try
date: 2026-11-14
image: /changelog/search-every-try/cover.png
---

You can now search every try from every scene, by words and by facts. More Like This finds tries that moved the same way.

Scrolling works for thirty tries from a leader arm. It stops working at a thousand tries from five scenes, when the ones you want to fix are the failed grasps on the red block.

## Search

Type in the Library's search, or in the new field at the top of Tries. Both take the same query.

Search for "failed grasp red block leader-arm" and Basecase reads failed and leader-arm as filters. It matches the other words against each try's Case, task, robot, source and input. Dates, durations, robots and servo faults work as filters too.

On 10,000 tries, a search took a median of 7 ms.

## More Like This

More Like This is on a try's right-click menu. It compares the path of the part that moves farthest and the speeds of the joints. On the same 10,000 tries, it took 31 ms.

## What the Camera Saw

Words also match what the scene camera saw, through a MobileCLIP model bundled with the app. Basecase embeds about four frames a second in the background. It only embeds tries from the open scene that were made with its open Case and current robot.

The agent searches the same way, with its `search_tries` tool.

Read [Search tries](/help/search-tries) for the steps.
