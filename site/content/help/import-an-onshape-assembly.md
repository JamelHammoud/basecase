---
title: Import an Onshape assembly as a robot
date: 2026-11-12
updated: 2026-11-13
collection: design
type: task
order: 17
keywords:
  - onshape
  - cad
  - assembly
  - mates
  - api key
  - accounts
related:
  - import-a-robot
  - pose-a-robot
covers:
  - src/components/settings/AccountsPane.tsx
  - src/app/settingsPanes.ts
  - src/components/ImportRobotSheet.tsx
  - src/onshape/
  - electron/onshape/
  - src/readiness/buildChecks.ts
  - src/workspace/useOnshapeUpdate.ts
---

You can bring a robot you modeled in Onshape into Basecase. Its revolute and slider mates come in as joints you can pose.

1. In Onshape's developer portal, create an API key that can read your documents, then copy its access key and secret key.
2. Press [[⌘,]] to open Settings, then choose **Accounts**.
3. Paste the access key into **Access key** and the secret key into **Secret key**. When Basecase has saved both keys, your Onshape account name appears under Secret key.

![The Accounts pane with both Onshape keys saved](/help/import-an-onshape-assembly/accounts.png)

4. In Onshape, open the assembly's tab and copy the link from the address bar.
5. Press [[⌘K]], choose **Import Robot**, paste the link, then press [[↩]].

![Import Robot with an Onshape assembly link](/help/import-an-onshape-assembly/link.png)

If you haven't saved the keys, or Onshape refuses them, a message appears that names **Accounts**. Click **Open** in the message to go there and paste your keys.

Here's how the assembly comes in:

- Each part becomes its own mesh. Parts that a fastened mate or a mate group holds together arrive as one part.
- Revolute mates become hinges and slider mates become slides. Each joint takes its range from the mate's limits, and 0 is the position the assembly was in when you imported it.
- A revolute or slider mate inside a subassembly also becomes a joint, but without its limits.
- The part you fixed in Onshape becomes the robot's base.
- If a part has a material in Onshape, its mass comes in too.

6. In the message that says the robot was inserted, click **Pose**, then drag a joint's slider.

![The Pose tab turning the imported Elbow hinge](/help/import-an-onshape-assembly/pose.png)

Basecase holds any other mate fixed, such as a cylindrical, ball or pin slot mate. In the Build tab, Checks lists each one under Fixed Mates, on the part it holds, so you can add the joint by hand. Each part attaches through a single joint, so Basecase leaves out a mate that closes a loop, like the last pin of a four-bar linkage.

If you change the assembly in Onshape, you can bring in the changes without importing it again:

7. Right-click the robot's group in Layers, or any of its parts, and choose **Update from Onshape**. It's also in [[⌘K]].

![The right-click menu of the Desk Arm group with Update from Onshape](/help/import-an-onshape-assembly/update.png)

Basecase replaces the parts you changed in Onshape where they sit, and removes the ones you deleted there. New parts and mates arrive as parts and joints. These stay as they were: the servo on each joint, colors, parts you added (like screws or cameras), poses and calibrations. A message tells you how many changes came in. To undo the whole update, press [[⌘Z]].

![The arm after the update, longer and with a new Wrist part, and the message 3 changes from Onshape](/help/import-an-onshape-assembly/updated.png)

If you delete a mate in Onshape, its joint stays. Checks lists it under Missing Mates, so you can remove the joint or add the mate back.

**Note:** A version link brings in that version every time. To keep up with your edits, import from the workspace link.
