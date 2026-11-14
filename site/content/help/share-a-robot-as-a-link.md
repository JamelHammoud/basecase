---
title: Share a robot as a link
date: 2026-11-13
updated: 2026-11-14
collection: files-and-sharing
type: task
covers:
  - src/workspace/useShareRobot.ts
  - src/workspace/shareRobot.ts
  - src/components/simulate/ResultsSection.tsx
  - src/workspace/caseCommands.tsx
  - src/gallery/
---

You can send someone a link that opens your robot and its Case in their browser, where they can drive the robot or open it in the studio. To share a robot, you need the desktop app and a Hugging Face account.

1. In **Settings** ▸ **Accounts**, add a Hugging Face access token with write access. The steps are the same as in [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face).
2. In the Play view, open a Case for your robot from the Cases tab.
3. Press [[⌘K]], then choose **Share Robot**.
4. Wait for the Link copied toast, then paste the link wherever you want to send it. Links look like `https://app.basecase.so/r/your-name/desk-rover-e39785`.

![The Link copied toast above the toolbar](/help/share-a-robot-as-a-link/copied.png)

If you haven't added a token, **Share Robot** opens **Accounts** instead. If the Hub refuses your token, click **Open** in the message and paste a new one.

Anyone who opens the link sees the robot in its Case's world, along with the Case's name and brief. They get a Drive button and Open Scene, which opens the robot in the studio in their browser. If the robot has legs, they also see **Train**, which uses their GPU to teach the robot to stand. Train works in Chrome or Edge. If they train the robot and then click Open Scene, the robot keeps that skill.

![A shared rover open in the browser, with Drive and Open Scene](/help/share-a-robot-as-a-link/browser.png)

If the Case has its own console, the console on the page has the same layout as **Run Case** in the studio (see [Run a Case](/help/run-a-case)). It uses the columns and panel order you set in [Arrange a Case's console](/help/arrange-a-case-console). Visitors see the panels around the robot, with the Case card at the top of the last column. Code panels work on the page too.

Some things stay in the studio: camera panels, the servos table and the tries list. No one can start a try from the page. Code panels on the page can move the Case's movable objects, but they get no camera frames, so a gesture can't press a button there. Open Scene opens the same Case, so **Run Case** in the studio shows the same app.

![A shared rover Case in the browser: speed and tilt over the robot, and Stop Driving, Open Scene and a joystick on the right](/help/share-a-robot-as-a-link/app.png)

Basecase saves the robot as one file in a public dataset repo on your Hugging Face account. The file holds the robot's parts and joints, the open Case with its console and code, and the newest trained policy or skill that passed, if there is one. The repo also has a `README.md` next to the file, which tags it `basecase-case`.

If you share the same Case from the same scene again, Basecase updates the same link. You can't share a robot if its file would be over 8 MB.
