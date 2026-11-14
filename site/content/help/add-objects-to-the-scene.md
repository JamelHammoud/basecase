---
title: Add everyday objects to the scene
date: 2026-11-13
updated: 2026-11-13
collection: design
type: task
order: 12
keywords:
  - objects
  - props
  - simready
  - nvidia
  - mug
  - box
  - table
  - furniture
  - environment
  - world
  - usd
related:
  - import-a-robot
  - organize-parts-in-layers
covers:
  - src/workspace/useRobotInsert.ts
  - src/components/objects/
  - src/components/parts/ObjectsView.tsx
  - src/components/parts/insertSearch.ts
  - src/simready/
  - electron/simready/
---

You can place real objects next to your robot, such as a mug, a box or a shelf. They come from NVIDIA's SimReady Central at their true size and weight.

1. Click **Parts** in the view rail on the left.
2. Type what you want in **Search parts**, such as `mug`, then press [[↩]].
3. Hover over a result to see its size, weight and moving parts.
4. Click the result to insert it. Or drag it to the spot on the canvas where you want it.

![Kitchen objects searched for mug, showing a grid of SimReady mugs from NVIDIA](/help/add-objects-to-the-scene/kitchen.png)

A search that names a category, like `mug`, opens that category in Parts with your search in it. If nothing in Parts matches, pressing [[↩]] lists SimReady results instead.

A toast appears while the object downloads and converts. It closes when the object lands on the canvas, selected.

To browse instead of search, click a category under **Objects** in Parts, such as **Kitchen** or **Boxes and bins**.

![Parts scrolled to its Objects section, listing Kitchen, Food, Boxes and bins and the other categories](/help/add-objects-to-the-scene/objects.png)

An object moves freely in Simulate if its maker gave it a mass. Objects without a mass stay fixed. Checks treat a free object as scenery and don't add its weight to the robot's.

Each object shows its maker and license. Most are CC-BY 4.0. To see an object's page on Hugging Face, click **Open on Hugging Face** in its hover card.
