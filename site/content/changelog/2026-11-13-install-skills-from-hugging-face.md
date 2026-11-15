---
title: Install skills from Hugging Face
date: 2026-11-13
image: /changelog/install-skills-from-hugging-face/ranked.png
---

You can now find published skills ranked for your robot and install one from the list, where Arena proves it again.

To publish, right-click a ready skill and choose Publish to Hugging Face, under Train. Install Skill opens from ⌘K or a Train row's right-click menu. Its list sits under the repo link field, with Install beside each fitting skill.

Both work in the desktop app. Install Skill takes Motor Kit skills on legged robots.

Skills whose joints fit come first. Limb positions determine the next order, followed by the source's Arena passes. Refused skills appear last with their reason. Repos with mismatched files stay out of the list, and a disconnected Hub leaves the link field usable.

A policy on the Hub is trained for one robot, with nothing to show it works on yours. Until now, a hexapod's Stand started from zero, even when a quad with the same legs could already stand.

## From a Quad to a Hexapod

Install Skill maps the quad's policy onto the hexapod's legs. Each leg takes the nearest leg with as many joints, so the hexapod's middle pair copies the front pair.

The Motor Kit then trains from that policy, and Arena runs its 96 tries on the hexapod. The new skill keeps the hexapod's own evidence and the hash of the skill it started from.

## What Gets Checked

Install Skill checks every downloaded file against `skill.json` before anything trains. It refuses a repo whose legs have a different number of joints.

Taught skills and moves don't install.

## What's in the Repo

The repo carries the skill, the policy as ONNX, and a model card with the observation, the action and the body class.

Read [Install a skill from Hugging Face](/help/install-a-skill-from-hugging-face) and [Publish a skill to Hugging Face](/help/publish-a-skill-to-hugging-face) in the help center for the steps.
