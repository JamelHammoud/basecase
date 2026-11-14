---
title: React to gestures at the camera
date: 2026-11-13
image: /changelog/react-to-gestures-at-the-camera/cover.png
---

You can now make a Case react to a wave, a clap, a nod or a movement you teach it. Basecase reads the gestures from your computer's camera, and they work in the simulation.

Basecase has ten gestures built in: Wave, Raise Hand, Raise Both Hands, Point Left, Point Right, Thumbs Up, Open Palm, Clap, Nod and Shake Head. For any other movement, use Teach Gesture in ⌘K. It records the movement three times and saves it in the Case.

Until now, a humanoid could copy your arm movements through the camera, but it couldn't wave back when you waved at it.

Your Case's logic gets one event per gesture, so a wave you hold for 3 seconds fires once. Basecase measures built-in gestures in shoulder widths, so a child's wave fires the same as an adult's. A taught gesture matches when you do it faster or slower, as long as it stays within 1.8 times the gap between your own three recordings.

Recognition runs beside pose estimation and takes 0.13 ms a frame on an M5 Pro.

You can use gestures while the camera drives a humanoid or a fixed arm. For Thumbs Up and Open Palm, Basecase reads the pose model's three points per hand, so hold your hand in clear view in front of you.

Basecase saves your taught recordings and never saves the camera's picture.

Read [Teach a robot a gesture](/help/teach-a-robot-a-gesture) in the help center for the steps.
