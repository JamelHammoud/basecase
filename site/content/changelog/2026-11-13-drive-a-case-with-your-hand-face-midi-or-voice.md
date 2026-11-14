---
title: Drive a Case with your hand, face, MIDI or voice
date: 2026-11-13
image: /changelog/drive-a-case-with-your-hand-face-midi-or-voice/cover.png
---

You can now puppet an arm with your hand and aim a camera head at your face. A Case's logic can also hear MIDI notes and, in the desktop app, spoken words.

A Case's console lists the inputs that drive it. Four join keys, a gamepad, a phone and the body camera: `hand`, `face`, `midi` and `voice`. Ask the agent for a Case and name one.

The case that started it was a robot dog that should sit when you say “sit”. Nothing in Basecase could hear a word or read a MIDI note.

The hand moves a fixed arm's hand from where yours started, scaled to its reach. 10 cm of your hand is 18% of the arm's reach. Your pinch closes its gripper. The face turns a pan-tilt head toward you. Hand and face share the one camera stream the body input uses.

Each MIDI note sends the logic `midi` with its number, and each knob sends a value from 0 to 1. A `.mid` file dropped on the canvas plays on the simulation's clock. Voice listens on your computer for the words the Case's logic names, and each arrives about a second after you stop speaking. Its model is 41 MB, and no sound is saved.

Voice hears single English words only, and can mistake “set” for “sit”.

Steps are in [Drive a Case with your hand, face, MIDI or voice](/help/drive-a-case-with-your-hand-face-midi-or-voice).
