---
title: Publish a skill to Hugging Face
date: 2026-11-13
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

Put a ready skill on the Hugging Face Hub as a model repo, with its policy, its Arena evidence and a model card, so another robot can install it.

Publishing works in the desktop app. The repo is always public, and only a skill that passed Arena can go.

1. Sign in to Hugging Face under **Accounts** ([[⌘,]]), with a token that has write access. Steps are in [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face).
2. In the **Simulate** tab, find the ready skill under **Train**. A ready row shows its Arena result, such as "32 of 32 tries".
3. Right-click the row and choose **Publish to Hugging Face**.

![The Stand row's right-click menu with Publish to Hugging Face](/help/publish-a-skill-to-hugging-face/menu.png)

4. When the toast says "Published to" and the repo's name, click **Open** to see it on the Hub.

![The toast after publishing, with Open](/help/publish-a-skill-to-hugging-face/published.png)

**Publish Stand to Hugging Face**, and the same for each ready skill, is also in [[⌘K]]. Signed out, it opens **Accounts** instead.

## What gets published

The repo goes on your account, named after the robot and the skill plus 6 characters of the skill's hash, such as `quad-stand-1a2b3c`. It holds:

| File | What it is |
|---|---|
| `skill.json` | The skill, with the hashes of the design, contract and physics it was proved on |
| `policy.json` | The policy Basecase runs |
| `policy.onnx` | The same policy for ONNX Runtime |
| `contract.json`, `environment.json` | What Arena judged it on |
| `evidence.json` | Arena's result on your robot |
| `robot.json` | Each joint's limb and place in it, which Install Skill maps from |
| `README.md` | The model card: body class, joints, observation, action and Arena's runs |

To put it on another robot, see [Install a skill from Hugging Face](/help/install-a-skill-from-hugging-face).
