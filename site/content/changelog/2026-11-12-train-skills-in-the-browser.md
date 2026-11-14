---
title: Train skills in the browser
date: 2026-11-12
image: /changelog/train-skills-in-the-browser/cover.png
---

You can now train Motor Kit skills in the web studio at app.basecase.so, on your own GPU. It trains Stand, Walk, Get up and Settle, and Arena checks each one before you can use it.

## Where it is

Open a legged robot and click Simulate. The Train section lists the four skills, in the same rows the desktop app shows.

Click Train beside one and the row counts up while Forge trains in a background worker. The canvas stays usable while it runs. Click the square beside it to stop the run.

![Stand training at 25% in the web studio](/changelog/train-skills-in-the-browser/training.png)

## How it works

Training runs on a browser build of Forge, our trainer. Physics steps on your GPU through WebGPU, and the policy learns in WebAssembly. None of it downloads until you press Train.

When a run ends, Arena runs the policy in MuJoCo with random starts, half the physics timestep and random servo delays. A skill that passes shows its worst result, such as "32 of 32 tries, at least 91%". Click Try to run it in the simulation.

On an M5 Pro in Chrome, Stand passed in about two and a quarter minutes.

![Stand passed, with its Arena line and Try](/changelog/train-skills-in-the-browser/cover.png)

Passed skills are saved in your browser with the scene, so they're still there after you reload.

## What it doesn't do yet

Training needs WebGPU and WebAssembly JSPI. Chrome and Edge have both. In other browsers the Train section doesn't appear.

Teaching a skill by typing a goal goes through the agent, which is only in the desktop app. Only the desktop app retrains skills on their own after you change the robot.

Read [Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit) for the steps.
