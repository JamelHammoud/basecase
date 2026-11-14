---
title: Search every try
date: 2026-11-14
image: /changelog/search-every-try/cover.png
---

You can now search every try and segment in the Library by words, facts and tags. More Like This finds tries that moved the same way, from any scene.

Type in the Library's search or the search at the top of Tries. Thirty tries from a leader arm are easy to scroll. A thousand from five scenes aren't, and the failed grasps on the red block are the ones worth fixing.

A search for "failed grasp red block leader-arm" reads failed and leader-arm as filters and matches the rest against labels, Cases and tasks. Dates, durations, robots and inputs filter the same way. On 10,000 tries with 100,000 segments, a search took a median of 7 ms and More Like This 31 ms.

Words also match what the scene camera saw, through a MobileCLIP model bundled with the app. Basecase embeds about four frames a second in the background. That only covers tries in the open scene, made with its open Case and current robot.

Segments and tags come from labeling, which is the next step. The agent searches the same way with its `search_tries` tool.

Steps are in [Search tries](/help/search-tries).
