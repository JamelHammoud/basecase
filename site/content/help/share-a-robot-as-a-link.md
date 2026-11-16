---
title: Share a robot as a link
date: 2026-11-13
collection: files-and-sharing
type: task
covers:
  - src/workspace/useShareRobot.ts
  - src/workspace/shareRobot.ts
  - src/components/simulate/ResultsSection.tsx
  - src/workspace/caseCommands.tsx
  - src/components/ShareRobotSheet.tsx
  - src/gallery/
hub_run_a_case_order: 40
hub_run_a_case: |
  A link you make with **Share Robot** opens the same console in the browser. See [Share a robot as a link](/help/share-a-robot-as-a-link). Camera panels, the servos table and the tries work only in the studio. In the browser, code panels get no camera frames and keep no values.
---

Send someone a link that opens your robot and its Case in their browser. They can drive the robot there, or open it in the studio. Sharing works in the desktop app and needs a Hugging Face account.

1. In **Settings** ▸ **Accounts**, add a Hugging Face access token with write access. The steps are the same as in [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face).
2. In the Play view, open a Case for your robot from the Cases tab.
3. Press [[⌘K]], then choose **Share Robot**.
4. When the Link copied toast appears, paste the link wherever you want to send it. The link looks like `https://app.basecase.so/r/your-name/desk-rover-e39785`.

![The Share Robot sheet with a copied robot link and the League link field](/help/share-a-robot-as-a-link/league.png)

To enter a League, your robot must use its pinned Case and contract. You must get the publisher’s receipt before the deadline. Executable Case panels, Case logic and imported worlds can’t enter. Retained skills must use a network policy controller.

5. In the **Share Robot** sheet, paste the League’s link into **League link**.
6. Click **Enter League**.
7. Send the copied submission link to the League publisher for admission.

The sheet keeps the immutable submission link. To compare accepted entries, follow [Replay a League](/help/replay-a-league).

If you haven't added a token, **Share Robot** opens **Accounts** instead. If the Hub refuses your token, click **Open** in the message and paste a new one.

Someone who opens the link sees the robot in its Case's world, with the Case's name and brief. The page has a Drive button and Open Scene, which opens the robot in the studio in their browser. If the robot has legs, the page also shows **Train**, which uses their GPU to teach the robot to stand. Train works in Chrome or Edge. They can also click **Install Skill** to start from a published Motor Kit policy. The page keeps it only after training and Arena pass on this robot. If they click Open Scene after training, the robot keeps that skill. See [Install a skill from Hugging Face](/help/install-a-skill-from-hugging-face).

![A shared rover open in the browser, with Drive and Open Scene](/help/share-a-robot-as-a-link/browser.png)

If the Case has its own console, the page shows it the way **Run Case** does in the studio, as set up in [Run a Case](/help/run-a-case). The panels sit around the robot, the code panels work, and the Case card is at the top of the last column. Camera panels, the servos table and the tries list stay in the studio, and no one can start a try from the page. Code panels can move the Case's movable objects on the page, but they don't get camera frames there, so a gesture never presses a button on the page. Open Scene opens the same Case, so **Run Case** in the studio shows the same app.

![A shared rover Case in the browser: speed and tilt over the robot, and Stop Driving, Open Scene and a joystick on the right](/help/share-a-robot-as-a-link/app.png)

Sharing saves the robot as one file in a public dataset repo on your Hugging Face account. The file holds the robot's parts and joints, the open Case with its console and code, and the newest trained policy or skill that passed, if there is one. An imported world comes with it, including its collider mesh, textures and optional splat.

A `README.md` next to the file tags the repo `basecase-case`. Sharing the same Case from the same scene again updates the same link. You can't share a robot whose file would be over 8 MB, including its world.
