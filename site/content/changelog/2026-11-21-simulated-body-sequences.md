---
title: Run simulated body sequences
date: 2026-11-21
image: /changelog/simulated-body-sequences/cover.png
---

You can now run a bounded sequence of simulated motions from Analyze Try. It keeps each observation and chooses the next motion from their combined evidence.

This runs MuJoCo body dynamics in the desktop app. Ordinary servo-emulator recordings retain their refusal to identify body mass, payload or floor contact.

A weak wrist response can leave mass and payload coupled. The sequence stops when supported motions can’t add useful information, rather than spending more rounds on the same explanation.

The default limits are four rounds, eight trajectory seconds, one million physics steps and 128 MiB of retained storage. The duration includes a two-second independent validation observation, leaving room for three experiment observations. Each round retains its original recording, observed response and information contribution. Reopening reads those results without resuming execution.

Fit Body remains a separate action with its existing acceptance and rollback rules. Independent validation can leave the incumbent calibration unchanged. Information under assumed noise doesn’t establish identification accuracy or physical transfer.

Steps are in [Run a simulated body sequence](/help/run-a-simulated-body-sequence).
