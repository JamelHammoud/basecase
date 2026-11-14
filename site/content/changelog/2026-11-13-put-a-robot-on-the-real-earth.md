---
title: Put a robot on the real Earth
date: 2026-11-13
image: /changelog/place-a-robot-on-a-map/cover.png
---

You can now put a real place under your robot, drawn from Google's photorealistic 3D tiles. It works in the desktop app, with your own Map Tiles key in **Settings** ▸ **Accounts**.

An outdoor rover designed on an empty grid never meets the curb, the slope of the drive or the width of the path. You only see those when you put it on the real street.

## Use It

Open **Place on Map** from the canvas menu or [[⌘K]], and give it coordinates or a Google Maps link.

East runs along the canvas's X axis and north along -Z, in millimeters. A point 10 m north of the spot lands 10 m along the scene's north.

The floor sits on the tiles' surface under the spot, at a height read from the tiles themselves. Change **Height offset** to move it.

## How It Loads

Tiles load with more detail near the camera and less farther away. The canvas only redraws when a tile arrives or the view moves.

The tiles never show up in the captures that Checks and the agent read.

Every request goes through the app's main process to tile.googleapis.com, and the key never reaches the page.

## What It Doesn't Do

The tiles are a backdrop. The simulated robot doesn't drive on them, and the web studio doesn't draw them.

Read [Place a robot on a map](/help/place-a-robot-on-a-map) for the steps.
