---
title: Train through SSH
date: 2026-11-15
image: /changelog/train-on-another-computer/cover.png
---

You can train several seeds on another computer and return one candidate for local checking. Desktop studios support one Linux x64 computer over SSH.

Choose the computer in **Settings** ▸ **Training**, then use the skill's existing **Train** action. You can leave a long Stand run going after your laptop disconnects. Reconnect to the same run without starting another copy.

The studio transfers the matching Forge runtime and frozen job inputs, verifies their hashes and starts a detached process. It keeps remote logs within 1 MiB. If you stop a job while disconnected, the studio sends the stop request to that same job when you reconnect.

The studio checks the returned policy in Arena on your computer. You can’t use a remote computer to supply readiness evidence or apply an old run's result to a changed design. You use the same training inputs for existing demonstrations, taught motions and warm starts.

Choose up to 4 attempts and 2 concurrent trainers in Training settings. The seeds share the time and iteration budgets. Development evaluation selects one candidate before local Arena, and an Arena rejection ends that search. Completed children recover without repeating their training.

One attempt stays the default. Grouped runs don’t publish live training snapshots. You run automatic background training, coaching, stress training and hand-off training on your own computer. Hosted execution isn’t included.

Follow the steps in [Train on another computer](/help/train-on-another-computer).

Seed settings are in [Train several seeds on another computer](/help/train-several-seeds-on-another-computer).
