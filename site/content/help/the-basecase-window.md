---
title: The Basecase window
date: 2026-11-13
updated: 2026-11-14
collection: get-started
type: concept
order: 3
keywords:
  - interface
  - layout
  - sidebar
  - view rail
  - inspector
  - right panel
  - toolbar
  - panels
related:
  - run-a-command
  - keyboard-shortcuts
covers:
  - src/workspace/ViewRail.tsx
  - src/app/TitleBarTabs.tsx
  - src/workspace/TitleBarActions.tsx
  - src/workspace/RightPanelTabs.tsx
  - src/components/ViewportToolbar.tsx
  - src/components/LeftSidebar.tsx
  - src/components/PlayTabs.tsx
  - src/design-system/PanelResizer.tsx
  - src/design-system/ErrorBoundary.tsx
  - src/app/WindowBoundary.tsx
---

The Basecase window has views on the left, the canvas in the middle, and a panel on the right for whatever you've selected.

![The Basecase window: the view rail with Parts, Play, Layers and Library, Parts open beside it, the canvas in the middle and the right panel](/help/the-basecase-window/window.png)

## The title bar

From left to right, the title bar holds:

- The sidebar button, which shows or hides the left panel ([[⌘B]]).
- The **Scenes** menu, which lists every scene you've saved ([[⌘O]]).
- A tab for each open scene. Click **+** to start a new one ([[⌘T]]).
- **Undo** and **Redo** ([[⌘Z]] and [[⇧⌘Z]]).
- **Export**, for STL, 3MF, scene files and robot packages.
- The inspector button, which shows or hides the right panel ([[⌘I]]).

On Windows, click the **Menu** button at the far left to open the File, Edit, View, Window and Help menus. On a Mac, these menus are in the menu bar.

## The view rail and the sidebar

The column of icons on the left is the view rail. Click an icon to open its view in the sidebar beside it. To hide the sidebar, click the open view again.

| View | What it holds |
|---|---|
| **Parts** | Real servos, motors, boards, sensors and cameras, ISO hardware such as screws and nuts, published robots, and SimReady objects such as furniture and props |
| **Play** | **Cases**, **Routines** and **Operate** |
| **Layers** | Every part in the scene, as a tree |
| **Library** | Models you've saved to use in any scene |

To open Settings, click the gear at the bottom ([[⌘,]]). When an update has downloaded, a blue arrow appears above the gear.

## The canvas and the toolbar

The canvas shows your scene in 3D. To see the commands that apply to a part or an empty spot, right-click it.

The toolbar at the bottom holds **Move** (V), **Rotate** (E), **Scale** (R) and **Comment** (M). Click **Shapes** (A) to open basic shapes, **Sketch**, **Measure**, **Annotate** and **Import SVG**.

## The right panel

The right panel has a tab for each job:

- **Inspect** edits the selected part's size, position, rotation and look.
- **Pose** moves a robot's joints. It appears while a robot is selected.
- **Simulate** runs the scene under physics. It appears once the scene has movable joints.
- **Build** holds the Checks, the bill of materials, the build guide and printing. A red dot on the tab means something is left to fix, and the tab's tooltip tells you how many.
- **Agent** is where you talk to the agent. While a Case runs, it's the only tab.

To resize the sidebar or the right panel, drag its edge. To put it back to its default width, double-click the edge.

## When part of the window fails

A view, panel or sheet that fails shows its name and “stopped working”, such as “Parts stopped working”, with **Reload**. The rest of the window keeps working. If the whole window fails, **Reload Window** opens it again.

## The command menu

Press [[⌘K]] to search every command, part and saved model by name. For steps, see [Run any command from the keyboard](/help/run-a-command).
