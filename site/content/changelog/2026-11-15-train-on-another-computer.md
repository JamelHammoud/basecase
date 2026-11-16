---
title: Train through SSH
date: 2026-11-15
image: /changelog/train-on-another-computer/cover.png
---

You can train a skill on another computer, close the studio and recover the result when you return. Desktop studios support one Linux x64 computer over SSH.

Choose the computer in **Settings** ▸ **Training**, then use the skill's existing **Train** action. You can leave a long Stand run going after your laptop disconnects. Reconnect to the same run without starting another copy.

The studio transfers the matching Forge runtime and frozen job inputs, verifies their hashes and starts a detached process. It keeps remote logs within 1 MiB. If you stop a job while disconnected, the studio sends the stop request to that same job when you reconnect.

Test the returned policy in Arena on your computer. You can’t use a remote computer to supply readiness evidence or apply an old run's result to a changed design. You use the same training inputs for existing demonstrations, taught motions and warm starts.

You run automatic background training, coaching, stress training and hand-off training on your own computer. You can connect one training computer, with no parallel seed scheduling or hosted service.

Follow the steps in [Train on another computer](/help/train-on-another-computer).
