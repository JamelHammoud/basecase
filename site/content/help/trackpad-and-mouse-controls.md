---
title: Trackpad and mouse controls
date: 2026-11-13
updated: 2026-11-13
collection: get-started
type: reference
order: 2
keywords:
  - orbit
  - pan
  - zoom
  - rotate view
  - camera
  - navigation
  - scroll
  - gestures
related:
  - keyboard-shortcuts
  - the-basecase-window
covers:
  - src/three/viewport/wheel.ts
  - src/three/viewport/stage.ts
  - src/three/viewport/keys.ts
  - src/app/storedSettings.ts
  - src/components/SettingsWindow.tsx
  - src/data/cameraViews.ts
---

You can orbit, pan and zoom the 3D view with a trackpad or a mouse. Two-finger scrolling follows the scroll mode you choose.

## Gestures

| Gesture | What it does |
|---|---|
| Drag the canvas | Orbit |
| Right-drag or middle-drag | Pan |
| Hold [[Space]] and drag | Pan |
| Pinch, or [[⌘]] and scroll | Zoom |
| [[⇧]] and drag on an empty spot | Select the parts inside a box |
| Right-click, or two-finger click | Open the menu for what's under the pointer |

## Scrolling

A two-finger scroll or a mouse wheel follows the mode you pick in **Settings** ▸ **Canvas** ▸ **Two-finger scroll**. On Windows, this row is called **Scroll**.

| Mode | Scroll | [[⇧]] and scroll |
|---|---|---|
| **Orbit**, the Mac default | Orbits | Pans |
| **Pan** | Pans | Pans |
| **Zoom**, the Windows default | Zooms | Pans |

You can also change the mode in **View** ▸ **Two-Finger Scroll**, or from [[⌘K]] by choosing **Scroll to Orbit**, **Scroll to Pan** or **Scroll to Zoom**.

## Views

| Key | View |
|---|---|
| [[1]] | Isometric |
| [[2]] | Top |
| [[3]] | Front |
| [[4]] | Side, from the right |
| [[Z]] | Centers the orbit on the selection, or goes back to the home view with nothing selected |

To deselect everything and go back to the home view, choose **View** ▸ **Camera** ▸ **Reset View**.

You can zoom in as close as 25 mm to what you're looking at, and out as far as 12 m.

## Snapping

By default, moving snaps to 5 mm and rotating snaps to 15°. You can change these in **Settings** ▸ **Canvas** ▸ **Snapping**.

To move or rotate freely, hold [[⇧]] while you drag.
