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

You can send someone a link that opens your robot and its Case in their browser, where they can drive the robot or open it in the studio. Sharing works in the desktop app, and you need a Hugging Face account.

1. In **Settings** ▸ **Accounts**, add a Hugging Face access token with write access. The steps are the same as in [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face).
2. In the Play view, open a Case for your robot from the Cases tab.
3. Press [[⌘K]], then choose **Share Robot**.
4. When you see the Link copied toast, paste the link wherever you want to send it. Links look like `https://app.basecase.so/r/your-name/desk-rover-e39785`.

![The Link copied toast above the toolbar](/help/share-a-robot-as-a-link/copied.png)

If you haven't added a token, **Share Robot** opens **Accounts** instead. If the Hub doesn't accept your token, click **Open** in the message and paste a new one.

When someone opens the link, they see the robot in its Case's world, with the Case's name and brief. The page has a Drive button and an Open Scene button. Open Scene opens the robot in the studio, in their browser. If the robot has legs, the page also shows **Train**, which uses their GPU to teach the robot to stand. Train works in Chrome or Edge, and if they click Open Scene after training, the robot keeps that skill.

![A shared rover open in the browser, with Drive and Open Scene](/help/share-a-robot-as-a-link/browser.png)

If the Case has its own console, the page shows it the same way **Run Case** does in the studio, as set up in [Run a Case](/help/run-a-case). It keeps the columns and panel order you set in [Arrange a Case's console](/help/arrange-a-case-console). The panels sit around the robot with the Case card at the top of the last column, and the code panels work.

The page leaves out camera panels, the servos table and the tries list, and no one can start a try from it. Code panels can move the Case's movable objects, but they don't get camera frames on the page, so a gesture never presses a button there. Open Scene opens the same Case, so **Run Case** in the studio shows the same app.

![A shared rover Case in the browser: speed and tilt over the robot, and Stop Driving, Open Scene and a joystick on the right](/help/share-a-robot-as-a-link/app.png)

When you share, Basecase saves the robot as a single file in a public dataset repo on your Hugging Face account. The file holds the robot's parts and joints, the open Case with its console and code, and the newest trained policy or skill that passed, if there is one. A `README.md` next to the file tags the repo `basecase-case`. Sharing the same Case from the same scene again updates the same link. You can't share a robot if its file would be over 8 MB.
