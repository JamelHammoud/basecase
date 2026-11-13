---
title: Train skills in the browser
date: 2026-11-12
image: /changelog/train-skills-in-the-browser/cover.png
---

The web studio at app.basecase.so now trains Motor Kit skills (Stand, Walk, Get up and Settle) on your own GPU, and Arena checks each one before you can use it.

## Where it is

Open a legged robot, click Simulate, and the Train section lists the four skills, the same rows the desktop app shows. Click Train beside one and the row counts up as Forge trains in a background worker, so the canvas stays usable while it runs. The square beside it stops the run.

![Stand training at 25% in the web studio](/changelog/train-skills-in-the-browser/training.png)

## How it works

Training runs on Forge, our trainer, built for the browser: physics steps on your GPU through WebGPU, and the policy learns in WebAssembly. Nothing of it downloads until you press Train. When a run ends, Arena runs the policy in MuJoCo with random starts, half the physics timestep and random servo delays. A skill that passes shows its worst result, such as "32 of 32 tries, at least 91%", with Try to run it in the simulation. On an M5 Pro in Chrome, Stand passed in about two and a quarter minutes.

![Stand passed, with its Arena line and Try](/changelog/train-skills-in-the-browser/cover.png)

Passed skills are saved in your browser with the scene, so they're still there after a reload.

## What it doesn't do yet

It needs WebGPU and WebAssembly JSPI, which Chrome and Edge have. In other browsers the Train section doesn't appear. Teaching a skill by typing a goal goes through the agent, which is in the desktop app only, and the desktop app is still the place where skills retrain on their own after you change the robot.
