---
title: Try a Case on your real robot
date: 2026-11-13
collection: operate
type: task
keywords:
  - real robot
  - camera
  - webcam
  - phone
  - apriltag
  - floor mat
  - print
  - pdf
  - tracking
  - reality gap
related:
  - try-a-case
  - make-a-case
covers:
  - src/cases/mat/matLayout.ts
  - src/cases/mat/matPdf.ts
  - src/cases/mat/realTry.ts
  - src/cameras/mat/matTracking.ts
  - src/cameras/mat/matTracker.ts
  - src/workspace/useCaseMat.ts
  - src/workspace/useRealTry.ts
  - src/workspace/useRealReplay.ts
  - src/components/simulate/CaseSections.tsx
  - src/components/cases/CasesPanel.tsx
---

You can print a Case as a floor mat and film your robot as it drives across it. Basecase judges the run with the same contract the simulation uses.

This works in the desktop app, for Cases with a wheeled or legged robot. Basecase only watches the run. Drive the robot with its own remote or code. The camera's picture stays on your computer and is never saved.

1. Open the Case in **Cases**.
2. Right-click the Case, then choose **Export Case Mat**. Basecase saves a PDF named after the Case.

![The Case's right-click menu with Export Case Mat](/help/try-a-case-on-your-real-robot/export-case-mat.png)

3. Print every page at 100% scale. Don't use Fit to page. If the mat prints smaller, Basecase refuses it.
4. Lay the sheets on the floor edge to edge, with `A1` at the top left, and tape them down.

![Rover's Reach a Spot mat as 21 A4 sheets: tags on six sheets, the start box at the bottom and the path up to the spot](/help/try-a-case-on-your-real-robot/mat.png)

5. Take the tag from the last page and tape it flat on top of the robot, with its arrow pointing to the robot's front.

![The base tag page, with the arrow above the tag](/help/try-a-case-on-your-real-robot/base-tag.png)

6. Put the robot in the start box, facing the path.
7. Point your computer's camera at the mat from above and to one side. The camera needs to see the robot and at least two of the mat's tags.
8. In the **Simulate** tab, go to the **Try** section and click **Try on Real Robot**.

![Try on Real Robot under Try It in the Try section](/help/try-a-case-on-your-real-robot/try-on-real-robot.png)

9. If this is your first time, allow Basecase to use the camera.
10. Drive the robot through the Case before its time runs out. To stop, click **Stop Try**.

While you drive, Basecase draws the robot's base on the canvas where the camera sees it, along with the path the robot has driven so far.

![The tracked path running from the robot to the spot on the canvas, with the try's clock in the Try section](/help/try-a-case-on-your-real-robot/tracking.png)

When the try ends, it shows up in **Results** with a **Real** mark. Click its **Replay** button to draw its path over the path of the best sim try. Press [[Esc]] to clear them.

![A passed try marked Real in Results](/help/try-a-case-on-your-real-robot/real-try.png)

![The real try's path drawn over the best sim try's path on the canvas](/help/try-a-case-on-your-real-robot/replay.png)

**Note:** If the camera loses the robot's tag for more than 0.15 s, that part of the run can't count toward a pass. In a legged robot's Case, Basecase counts it as a fall. Keep the camera tilted, because a camera that looks straight down can't measure its own lens.

You can also start a try from [[⌘K]]. Type the Case's name, then choose **Try ⟨Case⟩ on Real Robot**.
