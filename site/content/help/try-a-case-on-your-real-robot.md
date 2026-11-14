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

Print a Case as a floor mat, film your robot driving on it, and judge the run with the same contract as the simulation.

It works for Cases with a wheeled or legged robot, in the desktop app. Basecase only watches: drive the robot with its own remote or code. The camera's picture stays on your computer and is never saved.

1. Open the Case in **Cases**.
2. Right-click the Case and choose **Export Case Mat**. Basecase saves a PDF named after the Case.

![The Case's right-click menu with Export Case Mat](/help/try-a-case-on-your-real-robot/export-case-mat.png)

3. Print every page at 100% scale, not Fit to page. A mat printed smaller is refused.
4. Lay the sheets on the floor edge to edge, `A1` at the top left, and tape them down.

![Rover's Reach a Spot mat as 21 A4 sheets: tags on six sheets, the start box at the bottom and the path up to the spot](/help/try-a-case-on-your-real-robot/mat.png)

5. Tape the last page's tag flat on top of the robot, with its arrow pointing to the robot's front.

![The base tag page, with the arrow above the tag](/help/try-a-case-on-your-real-robot/base-tag.png)

6. Put the robot in the start box, facing the path.
7. Point the computer's camera at the mat from above and to one side, so it sees at least two of the mat's tags and the robot.
8. In the **Simulate** tab's **Try** section, click **Try on Real Robot**.

![Try on Real Robot under Try It in the Try section](/help/try-a-case-on-your-real-robot/try-on-real-robot.png)

9. The first time, allow Basecase to use the camera.
10. Drive the robot through the Case before its time runs out, or click **Stop Try**.

The canvas draws the robot's base where the camera sees it, and its path so far.

![The tracked path running from the robot to the spot on the canvas, with the try's clock in the Try section](/help/try-a-case-on-your-real-robot/tracking.png)

The try appears in **Results** with a **Real** mark. Click its **Replay** button to draw its path over the best sim try's path. Press [[Esc]] to clear them.

![A passed try marked Real in Results](/help/try-a-case-on-your-real-robot/real-try.png)

![The real try's path drawn over the best sim try's path on the canvas](/help/try-a-case-on-your-real-robot/replay.png)

If the camera loses the robot's tag for more than 0.15 s, that stretch can't count toward a pass. A legged robot's Case then reads it as a fall. A camera looking straight down can't measure its own lens, so tilt it.

You can also start it from [[⌘K]]: type the Case's name and choose **Try ⟨Case⟩ on Real Robot**.
