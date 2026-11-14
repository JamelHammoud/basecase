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

You can print a Case as a floor mat and film your robot driving across it. Basecase judges the run against the same contract the simulation uses.

You need the desktop app and a Case with a wheeled or legged robot. You drive the robot with its own remote or code while Basecase watches. The camera's picture stays on your computer, and Basecase doesn't save it.

1. Open the Case in **Cases**.
2. Right-click the Case, then choose **Export Case Mat**. Basecase saves a PDF named after the Case.

![The Case's right-click menu with Export Case Mat](/help/try-a-case-on-your-real-robot/export-case-mat.png)

3. Print every page at 100% scale with Fit to page turned off. If the mat prints smaller, Basecase rejects it.
4. Lay the sheets on the floor edge to edge, with `A1` at the top left, and tape them down.

![Rover's Reach a Spot mat as 21 A4 sheets: tags on six sheets, the start box at the bottom and the path up to the spot](/help/try-a-case-on-your-real-robot/mat.png)

5. Tape the tag from the last page flat on top of the robot, with its arrow pointing to the robot's front.

![The base tag page, with the arrow above the tag](/help/try-a-case-on-your-real-robot/base-tag.png)

6. Put the robot in the start box, facing the path.
7. Point your computer's camera at the mat from above and to one side, so that it sees the robot and at least two of the mat's tags.
8. In the **Simulate** tab, go to the **Try** section, then click **Try on Real Robot**.

![Try on Real Robot under Try It in the Try section](/help/try-a-case-on-your-real-robot/try-on-real-robot.png)

9. The first time you try, allow Basecase to use the camera.
10. Drive the robot through the Case before its time runs out. To stop early, click **Stop Try**.

As you drive, the canvas shows the robot's base where the camera sees it, along with the path the robot has taken so far.

![The tracked path running from the robot to the spot on the canvas, with the try's clock in the Try section](/help/try-a-case-on-your-real-robot/tracking.png)

The finished try appears in **Results** with a **Real** mark. Click its **Replay** button to draw its path over the best sim try's path. To clear the paths, press [[Esc]].

![A passed try marked Real in Results](/help/try-a-case-on-your-real-robot/real-try.png)

![The real try's path drawn over the best sim try's path on the canvas](/help/try-a-case-on-your-real-robot/replay.png)

**Note:** If the camera loses sight of the robot's tag for more than 0.15 s, that stretch of the run doesn't count toward a pass. In a legged robot's Case, Basecase counts it as a fall. Keep the camera tilted, because Basecase can't measure the lens of a camera that looks straight down.

You can also start a try from [[⌘K]]. Type the Case's name, then choose **Try ⟨Case⟩ on Real Robot**.
