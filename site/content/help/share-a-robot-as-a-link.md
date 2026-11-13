---
title: Share a robot as a link
date: 2026-11-13
updated: 2026-11-13
collection: files-and-sharing
type: task
covers:
  - src/workspace/useShareRobot.ts
  - src/workspace/shareRobot.ts
  - src/components/simulate/ResultsSection.tsx
  - src/workspace/caseCommands.tsx
  - src/gallery/
---

Send someone a link that opens your robot and its Case in their browser, where they can drive it and open it in the studio. It works in the desktop app, with a Hugging Face account.

1. Add a Hugging Face access token with write access in Settings ▸ Accounts, as in [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face).
2. Open a Case for your robot from the Cases tab in the Play view.
3. In the Simulate tab, click **Share Robot** in Results. It's also in ⌘K.

![Results in the Simulate tab with Share Robot under it](/help/share-a-robot-as-a-link/results.png)

4. When the toast says Link copied, paste the link wherever you want to send it. It looks like `https://app.basecase.so/r/your-name/desk-rover-e39785`.

![The Link copied toast above the toolbar](/help/share-a-robot-as-a-link/copied.png)

Without a token, **Share Robot** opens **Accounts** instead. If the Hub refuses the token, click **Open** in the message to paste a new one.

Whoever opens the link sees the robot in its Case's world with the Case's name and brief, a Drive button and Open Scene, which opens the robot in the studio in their browser. A legged robot also gets **Train**, which teaches it to stand on their GPU, in Chrome or Edge. Open Scene then brings that skill along.

![A shared rover open in the browser, with Drive and Open Scene](/help/share-a-robot-as-a-link/browser.png)

A Case with its own console opens the way **Run Case** shows it in the studio, as set up in [Run a Case](/help/run-a-case). Its panels sit around the robot, its code panels work, and the Case card heads the last column. Camera panels, the servos table and the tries list stay in the studio, and the page can't start a try. Code panels can move the Case's movable objects on the page. The camera frames they watch and the score they keep stay in the studio. Open Scene opens the same Case, so **Run Case** in the studio shows the same app.

![A shared rover Case in the browser: speed and tilt over the robot, and Stop Driving, Open Scene and a joystick on the right](/help/share-a-robot-as-a-link/app.png)

The robot is saved as one file in a public dataset repo on your Hugging Face account. It holds the robot's parts and joints, the open Case with its console and code, and the newest trained policy or skill that passed, if there is one. Beside it, a `README.md` tags the repo `basecase-case`. Sharing the same Case from the same scene again updates the same link. A robot whose file would be over 8 MB can't be shared.
