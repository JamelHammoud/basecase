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

The Basecase window has three areas. Views are on the left, the canvas is in the middle, and the panel on the right shows whatever you've selected.

![The Basecase window: the view rail with Parts, Play, Layers and Library, Parts open beside it, the canvas in the middle and the right panel](/help/the-basecase-window/window.png)

## The title bar

From left to right, the title bar holds:

- The sidebar button. Click it to show or hide the left panel ([[⌘B]]).
- The **Scenes** menu, which lists every scene you've saved ([[⌘O]]).
- A tab for each open scene. To start a new scene, click **+** ([[⌘T]]).
- **Undo** and **Redo** ([[⌘Z]] and [[⇧⌘Z]]).
- **Export**, for STL, 3MF, cut files, STEP, scene files and robot packages.
- The inspector button. Click it to show or hide the right panel ([[⌘I]]).

On a Mac, the File, Edit, View, Window and Help menus are in the menu bar. On Windows, they're under the **Menu** button at the far left.

## The view rail and the sidebar

The column of icons on the left is the view rail. Click an icon to open its view in the sidebar next to it. To hide the sidebar, click the open view again.

| View | What it holds |
|---|---|
| **Parts** | Real servos, motors, boards, sensors and cameras, ISO hardware such as screws and nuts, published robots, and SimReady objects such as furniture and props |
| **Play** | **Cases**, **Routines** and **Operate** |
| **Layers** | Every part in the scene, as a tree |
| **Library** | Models you've saved to use in any scene |

To open Settings, click the gear at the bottom ([[⌘,]]). When an update has downloaded, a blue arrow appears above the gear.

## The canvas and the toolbar

The canvas shows your scene in 3D. Right-click a part or an empty spot to see the commands that apply to it.

The toolbar at the bottom holds **Move** (V), **Rotate** (E), **Scale** (R) and **Comment** (M). For basic shapes, **Sketch**, **Measure**, **Annotate** and **Import SVG**, click **Shapes** (A).

## The right panel

The right panel has these tabs:

- **Inspect** edits the selected part's size, position, rotation and look.
- **Pose** appears while a robot is selected. Use it to move the robot's joints.
- **Simulate** appears once the scene has movable joints. It runs the scene under physics.
- **Build** holds the Checks, the bill of materials, the build guide and printing. A red dot on the tab means something is left to fix, and the tab's tooltip shows how many.
- **Agent** is where you talk to the agent. While a Case runs, it's the only tab.

To resize the sidebar or the right panel, drag its edge. To put it back to its default width, double-click the edge.

## When part of the window fails

If a view, panel or sheet fails, it shows its name followed by “stopped working” (for example, “Parts stopped working”) and a **Reload** button. The rest of the window keeps working. If the whole window fails, click **Reload Window** to open it again.

## The command menu

Press [[⌘K]] to search for any command, part or saved model by name. For steps, see [Run any command from the keyboard](/help/run-a-command).
