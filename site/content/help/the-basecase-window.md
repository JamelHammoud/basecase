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

The Basecase window has three areas: views on the left, your scene on the canvas in the middle, and a panel on the right for whatever you've selected.

![The Basecase window: the view rail with Parts, Play, Layers and Library, Parts open beside it, the canvas in the middle and the right panel](/help/the-basecase-window/window.png)

## The title bar

From left to right, the title bar has:

- The sidebar button. Click it to show or hide the left panel ([[⌘B]]).
- The **Scenes** menu, with every scene you've saved ([[⌘O]]).
- A tab for each open scene. Click **+** to start a new scene ([[⌘T]]).
- **Undo** and **Redo** ([[⌘Z]] and [[⇧⌘Z]]).
- **Export**, for STL, 3MF, cut files, scene files and robot packages.
- The inspector button. Click it to show or hide the right panel ([[⌘I]]).

On Windows, the File, Edit, View, Window and Help menus are under the **Menu** button at the far left. On a Mac, they're in the menu bar.

## The view rail and the sidebar

The column of icons on the left is the view rail. Click an icon to open that view in the sidebar next to it. To hide the sidebar, click the open view's icon again.

| View | What it holds |
|---|---|
| **Parts** | Real servos, motors, boards, sensors and cameras, ISO hardware such as screws and nuts, published robots, and SimReady objects such as furniture and props |
| **Play** | **Cases**, **Routines** and **Operate** |
| **Layers** | Every part in the scene, as a tree |
| **Library** | Models you've saved to use in any scene |

Click the gear at the bottom to open Settings ([[⌘,]]). After an update downloads, a blue arrow appears above the gear.

## The canvas and the toolbar

The canvas shows your scene in 3D. Right-click a part or an empty spot to see the commands that apply to it.

The toolbar at the bottom has **Move** (V), **Rotate** (E), **Scale** (R) and **Comment** (M). Click **Shapes** (A) for basic shapes, **Sketch**, **Measure**, **Annotate** and **Import SVG**.

## The right panel

The right panel has a tab for each kind of work:

- **Inspect** changes the selected part's size, position, rotation and look.
- **Pose** moves a robot's joints. It appears while you have a robot selected.
- **Simulate** runs the scene with physics. It appears once the scene has movable joints.
- **Build** holds the Checks, the bill of materials, the build guide and printing. A red dot on the tab means something needs fixing. To see how many things are left, hold the pointer over the tab.
- **Agent** is where you talk to the agent. While a Case runs, Agent is the only tab.

Drag the edge of the sidebar or the right panel to resize it. Double-click the edge to return it to its default width.

## When part of the window fails

If a view, panel or sheet fails, it shows its name and “stopped working” (for example, “Parts stopped working”) with a **Reload** button. The rest of the window keeps working. If the whole window fails, click **Reload Window** to open it again.

## The command menu

Press [[⌘K]] to search for any command, part or saved model by name. For instructions, see [Run any command from the keyboard](/help/run-a-command).
