---
title: Count objects through zones and lines
date: 2026-11-22
collection: simulate-and-train
type: task
order: 12
keywords:
  - tracking
  - counting
  - zone
  - line
  - crossing
  - dwell
  - detector
  - conveyor
  - occupancy
related:
  - watch-what-the-robots-cameras-see
  - arrange-a-case-console
  - train-a-vision-model
covers:
  - src/vision/tracking/tracker.ts
  - src/vision/tracking/regions.ts
  - src/vision/tracking/session.ts
  - src/vision/inference.worker.ts
  - src/cameras/visionRegions.ts
  - src/cameras/visionSignals.ts
  - src/cases/console/regions.ts
  - src/cases/console/regionEdits.ts
  - src/components/cameras/RegionDraw.tsx
  - src/components/cameras/RegionShapes.tsx
  - src/components/cameras/regionMenu.ts
  - src/workspace/useCaseRegions.ts
hub_run_a_case_order: 16
hub_run_a_case: |
  A Case can count what a detector sees move through a camera's view. Draw a line or a zone on a camera panel, and the console reads crossings, objects inside and dwell time. See [Count objects through zones and lines](/help/count-objects-through-zones-and-lines).
---

Draw a line or a zone on a camera in a Case, and Basecase counts the detected objects that cross it or stay inside it.

You need a Case with a camera panel and a detection model on that camera. Draw the line across the path the objects take.

1. Open the Case and press **Run Case**.
2. Right-click the camera panel and choose **Draw Line**.
3. Drag from where the objects start to where they end. The line shows an arrow on its right-hand side.
4. To draw a zone, right-click the panel and choose **Draw Zone**. Click each corner, then double-click, press [[↩]] or click the first corner.
5. Press [[Esc]] to cancel a drawing.

![The conveyor Case after a try: the line on the camera panel reads line1 4 in 0 out, and the Crossings panel reads 4](/help/count-objects-through-zones-and-lines/crossings.png)

Basecase names them `line1`, `zone1` and so on, and saves them with the Case. Each camera keeps its own, so two cameras can both have a `line1`.

## Read the counts

Each drawing shows its count on the camera panel. Objects also show an id such as `#3` that stays with the object from frame to frame. The same counts are signals, and you read them like `vision.<camera>.<class>`:

- `vision.<camera>.line.<name>.in` and `.out` count crossings. In is toward the right of the arrow.
- `vision.<camera>.zone.<name>.count` is how many objects are inside, and `.dwell` is how long the longest has stayed, in seconds.
- `vision.<camera>.<class>.tracks` is how many objects of a class are tracked now.

To show one, right-click a card, choose **Add Panel**, then choose **Value** and the signal. Case logic and Routine watchers read the same names. A recorded try keeps its counts while paused.

## Remove them

Right-click the camera panel and choose **Delete Lines and Zones**, then click **Delete**.

## Limits

Counting needs a detection model on the camera, and the model's classes decide what is counted. A line or zone counts every class unless the agent limits it to one.

An object that leaves the view for more than 1.5 seconds comes back with a new id. A source that moves an object more than about two box widths between frames can swap its id with a neighbor.

A camera tracks up to 64 objects. A Case holds up to 8 cameras with regions, and each holds up to 16 zones and 16 lines. A zone has 3 to 32 corners.

You can ask the agent for the same thing in words, such as "count the blocks that pass the line". It writes the line or zone into the Case's console.
