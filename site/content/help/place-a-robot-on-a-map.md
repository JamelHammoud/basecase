---
title: Place a robot on a map
date: 2026-11-13
collection: design
type: task
keywords:
  - google maps
  - 3d tiles
  - photorealistic tiles
  - earth
  - gps
  - coordinates
  - outdoor
  - street
related:
  - add-a-camera-view
covers:
  - src/workspace/useEarthPlace.ts
  - src/components/PlaceOnMapSheet.tsx
  - src/earth/earthOrigin.ts
  - src/three/viewport/earthLayer.ts
  - src/components/settings/AccountsPane.tsx
---

Draw Google's photorealistic 3D tiles of a real place under the robot, so an outdoor design sits on the street it's built for.

It works in the desktop app, with a Google Map Tiles API key of your own.

1. Press [[⌘,]] and choose **Accounts**.
2. Paste your key into **Map Tiles key** under **Google Maps**, and press [[↩]]. Basecase checks the key with Google before it saves it.

![The Accounts pane with the Map Tiles key field under Google Maps](/help/place-a-robot-on-a-map/accounts.png)

3. Right-click an empty spot on the canvas and choose **Place on Map**.
4. Paste the place's coordinates, such as `37.7793, -122.4193`, or its Google Maps link.
5. Click **Place**.

![The Place on Map sheet with a Google Maps link pasted and Height offset at 0 m](/help/place-a-robot-on-a-map/sheet.png)

The tiles stream in around the spot, with Google's attribution in the canvas corner. East runs along the red X axis and north away from the blue Z axis. The floor sits on the tiles' surface under the spot; **Height offset** raises or lowers the robot from it. A third number after the coordinates sets the height above the WGS84 ellipsoid instead.

**Place on Map** is also in [[⌘K]], and without a saved key it opens **Accounts** at the key. **Hide Map** in [[⌘K]], or **Show Map** in the canvas menu, hides the tiles and keeps the place with the scene.

The canvas draws tiles up to 80 m from the camera. A shortened `maps.app.goo.gl` link doesn't read: open it in your browser and paste the full address.
