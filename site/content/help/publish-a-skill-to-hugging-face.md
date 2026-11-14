---
title: Publish a skill to Hugging Face
date: 2026-11-13
updated: 2026-11-14
collection: simulate-and-train
type: task
order: 14
keywords:
  - hf
  - hub
  - upload
  - share skill
  - model repo
  - onnx
  - policy
  - model card
related:
  - train-stand-and-walk-with-the-motor-kit
  - install-a-skill-from-hugging-face
covers:
  - src/components/SimulatePanel.tsx
  - src/components/simulate/SkillsList.tsx
  - src/workspace/useSkillHub.ts
  - src/workspace/skillCommands.tsx
  - src/skills/hubSkill.ts
  - src/skills/modelCard.ts
  - src/skills/robotSchema.ts
  - electron/hub/
---

You can publish a ready skill to the Hugging Face Hub as a model repo, then install it on another robot.

**Note:** Publishing works in the desktop app, and only for a skill that passed Arena. The repo is always public.

1. Sign in to Hugging Face under **Accounts** ([[⌘,]]) with a token that has write access. To learn how, see [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face).
2. In the **Simulate** tab, find the ready skill under **Train**. A ready row shows its Arena result, for example "32 of 32 tries".
3. Right-click the row, then choose **Publish to Hugging Face**.

![The Stand row's right-click menu with Stress, Coach and Publish to Hugging Face](/help/publish-a-skill-to-hugging-face/menu.png)

4. When the toast shows "Published to" and the repo's name, click **Open** to view the repo on the Hub.

![The toast after publishing, with Open](/help/publish-a-skill-to-hugging-face/published.png)

You can also publish from [[⌘K]]. Every ready skill has its own command, for example **Publish Stand to Hugging Face**. If you aren't signed in, the command opens **Accounts** instead.

Publishing creates a repo on your account, named after the robot and the skill, for example `quad-stand-1a2b3c`. The repo contains:

- The policy, as JSON and ONNX
- The policy's Arena evidence
- The joint layout that Install Skill maps from
- A model card

To put the skill on another robot, see [Install a skill from Hugging Face](/help/install-a-skill-from-hugging-face).
