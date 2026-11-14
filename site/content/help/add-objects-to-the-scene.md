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

Place a mug, a box, a shelf or another real object from NVIDIA's SimReady Central next to your robot, at true size and weight.

1. Click **Parts** in the view rail on the left.
2. Type what you want in **Search parts**, such as `mug`, and press [[↩]].
3. Hover a result to see its size, weight and moving parts.
4. Click the result to insert it.

![Kitchen objects searched for mug, showing a grid of SimReady mugs from NVIDIA](/help/add-objects-to-the-scene/kitchen.png)

A word that names a category, like `mug`, opens that category with your search in it. When nothing in Parts matches, [[↩]] lists SimReady results instead. A toast shows the download and conversion, and closes when the object lands on the canvas, selected. You can also drag a result to where it should go on the canvas.

To browse instead of searching, click a category under **Objects** in Parts, such as **Kitchen** or **Boxes and bins**.

![Parts scrolled to its Objects section, listing Kitchen, Food, Boxes and bins and the other categories](/help/add-objects-to-the-scene/objects.png)

Objects whose maker gave a mass move freely in Simulate, and the rest stay fixed. Checks treat a free object as scenery, so its weight stays out of the robot's.

Each object shows its maker and license; most are CC-BY 4.0. **Open on Hugging Face**, in the hover card, opens its page there.
