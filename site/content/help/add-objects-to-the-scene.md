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
  - src/components/objects/
  - src/simready/
  - electron/simready/
---

Place a mug, a box, a shelf or another real object from NVIDIA's SimReady Central next to your robot, at true size and weight.

1. Click **Objects** in the view rail on the left.
2. Type what you want in **Search objects**, such as `mug`, and wait for the results.
3. Hover a result to see its size, weight and moving parts.
4. Click the result to insert it.

A toast shows the download and conversion. You can also drag a result to where it should go on the canvas. To browse instead of searching, click a category under the field, such as **Kitchen** or **Boxes and bins**.

Objects whose maker gave a mass move freely in Simulate, and the rest stay fixed. Checks treat a free object as scenery, so its weight stays out of the robot's.

Each object shows its maker and license; most are CC-BY 4.0. **Open on Hugging Face**, in the hover card, opens its page there.
