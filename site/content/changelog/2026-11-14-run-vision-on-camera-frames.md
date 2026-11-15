---
title: Run vision on camera frames
date: 2026-11-14
image: /changelog/run-vision-on-camera-frames/cover.png
---

You can now run object, person and face detection on camera images inside Basecase. Camera tiles show boxes, classes and scores in simulation, your computer's camera and recorded video.

A robot that reacts to a cup needs to see the cup in its camera image. The same detections now reach Case signals, Routine senses and the agent's camera reads.

Models download on first use, pass a hash check and stay cached locally. Inference runs in a worker with WebGPU and a CPU fallback, independently of the camera display rate. Default camera detection requests five frames per second and drops older queued frames.

The CPU fallback can take seconds per image. Routines preserve capture age and ignore stale images. Depth gives relative nearness, without a distance in meters. Custom model training is outside this change.

Steps are in [Watch what the robot's cameras see](/help/watch-what-the-robots-cameras-see).
