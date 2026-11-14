---
title: Add parts from the catalog
date: 2026-11-13
updated: 2026-11-13
collection: design
type: task
order: 1
keywords:
  - catalog
  - components
  - hardware
  - screw
  - bolt
  - nut
  - washer
  - bearing
  - standoff
  - heat-set insert
  - primitive
  - cube
  - cylinder
  - basic shapes
  - find parts
related:
  - parts-assemblies-and-mounting-ports
  - move-and-rotate-parts
covers:
  - src/components/PartsPanel.tsx
  - src/components/parts/
  - src/components/HardwareConfigurator.tsx
  - src/components/ViewportToolbar.tsx
  - src/workspace/usePartCreation.ts
  - src/workspace/partFactories.ts
  - src/data/components.ts
  - src/data/hardware.ts
  - src/data/catalog.ts
---

You can place a real servo, board or sensor, an ISO screw or nut, or a basic shape that you can make any size.

## Add a real component

1. Click **Parts** in the view rail on the left.
2. Click a group under **Components**, such as **Servos**.
3. Hover a tile to see the part's size, weight and main specs.
4. Click the tile to open its page.
5. Click **Add** at the bottom of the page.

![The Servos list in Parts, with the hover card for a Feetech STS3215 showing its size, weight and strength](/help/parts-hover-card/hover-card.png)

Basecase places the part on the floor at the origin and selects it. You can also click **+** on a tile, or drag the tile to where you want it on the canvas.

To find a part by name, maker or part number from anywhere in Parts, use **Search parts**. Press [[⌘F]] to open it, ready to type.

![Parts searched for servo, with the matching servos listed under the field and the + showing on the highlighted DSServo DS3218](/help/add-parts-from-the-catalog/search.png)

Search parts finds robots and objects too. If your search names a robot, Search lists the robot before the parts named after it. Click its row to insert it. To add the highlighted part or robot, press [[⌘↩]].

![Parts searched for so-101, with the SO-101 Arm robot above the SO-101 Gripper and the STS3215 servo](/help/add-parts-from-the-catalog/robot-first.png)

To search SimReady Central as well, press [[↩]] on a robot or on a search with no match. Its arms, grippers and props appear in a **SimReady** section below the local results.

![Parts searched for franka, with the Franka Panda row above a SimReady section of Franka arms and hands](/help/add-parts-from-the-catalog/simready.png)

A component keeps the maker's exact size, so its Inspector doesn't have a **Size** section. To learn where the meshes come from, see [Parts, assemblies and mounting ports](/help/parts-assemblies-and-mounting-ports).

## Add a screw, nut or other hardware

1. In **Parts**, click a family under **Hardware**, such as **Screws** or **Heat-Set Inserts**.
2. Click a type, such as **Socket** or **Button**.
3. Choose the **Drive**, **Size**, **Finish** and **Length**.
4. Click **Add**.

You can type an exact size into the search field, such as `m3x12`, `M2.5 standoff 12` or `608`.

You can choose any length from the shortest stock length up to 300 mm, in 0.5 mm steps. If you choose a length between stock sizes, Basecase names the nearest stock lengths. Heat-set inserts come in stock lengths only.

## Add a basic shape

1. Click **Shapes** in the bottom toolbar.
2. Click **Plate**, **Cube**, **Shaft**, **Tube**, **Wedge**, **Sphere**, **Cone**, **Pyramid**, **Hex Prism**, **Capsule**, **Dome** or **Ring**.
3. In the Inspector, type the size under **Size**: **W**, **H** and **D**, in millimeters.

Width and height can be up to 2000 mm, and depth up to 600 mm.

You can also press [[A]] to open Shapes, and drag a shape onto the canvas instead of clicking it.

**Hole**, **Slot** and **Pivot Axis** are in [[⌘K]]. A Hole or Slot is a Cutout: overlap it with a part, then subtract it. To learn how, see [Cut, join and intersect parts](/help/cut-join-and-intersect-parts).
