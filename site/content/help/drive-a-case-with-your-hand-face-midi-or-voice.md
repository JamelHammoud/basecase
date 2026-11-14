---
title: Drive a Case with your hand, face, MIDI or voice
date: 2026-11-13
collection: simulate-and-train
type: task
keywords:
  - hand tracking
  - face tracking
  - pan tilt
  - MIDI
  - MIDI keyboard
  - voice
  - speech
  - keyword
  - microphone
  - puppet
related:
  - run-a-case
  - drive-a-robot-with-your-camera
covers:
  - src/cameras/operator/handFollow.ts
  - src/cameras/operator/faceFollow.ts
  - src/cameras/operator/lookJoints.ts
  - src/cameras/operator/cameraSource.ts
  - src/midi/
  - src/voice/
  - src/sim/inputSources.ts
  - src/sim/inputEvents.ts
---

Puppet an arm with your hand, aim a camera head at your face, or send a Case's logic MIDI notes and spoken words.

These inputs drive a running Case, not the studio on its own. Voice works in the desktop app only.

1. In the **Agent** tab, ask for the Case and name its input, such as “/case a pan-tilt camera that keeps my face centered”. It opens the Case running.

![The Puppet the Arm Case open, with You on the left, the arm in the middle and Try It on the right](/help/drive-a-case-with-your-hand-face-midi-or-voice/console.png)

2. Click **Try It**.
3. The first time, allow Basecase to use the camera or the microphone.
4. Use the input the Case names, as in the table below.

![A try 6.8 seconds in, with the computer's camera under You and the arm bent to the right](/help/drive-a-case-with-your-hand-face-midi-or-voice/hand.png)

Press [[Esc]] to stop. The camera and the microphone turn off.

For MIDI, plug in a keyboard or controller, or drop a `.mid` file on the canvas.

You can also add the input to the Case's console in your `.basecase` file, as in [Run a Case](/help/run-a-case).

## What each input does

| Input | What you do | What happens |
|---|---|---|
| `hand` | Move one hand in front of the camera. Pinch your thumb and index finger together. | A fixed arm's hand follows yours, scaled to its reach: 10 cm of your hand is 18% of the arm's reach. The pinch closes its gripper. |
| `face` | Sit in front of the camera. | A camera head turns its pan and tilt joints toward your face. |
| `midi` | Play a MIDI keyboard or controller, or drop a `.mid` file. | Each note sends the Case's logic the event `midi` with the note's number. Each knob or slider sends `midi.cc.` and its number, from 0 to 1. |
| `voice` | Say a word the Case's logic listens for, such as “sit”. | The logic gets the event `voice` with that word. |

![A pan-tilt Case during a try, with the computer's camera under You and the camera head turned and tilted](/help/drive-a-case-with-your-hand-face-midi-or-voice/face.png)

Where your hand is when the camera first sees it is its rest. The arm moves from there, so hold still for a moment at the start.

The face input uses joints named pan and tilt. Without them, it uses the two joints nearest the robot's camera, the one nearer the base as pan.

A dropped MIDI file plays from the start of each try, on the simulation's clock. The newest file you drop replaces the last.

Voice hears single English words, only the ones the Case's logic names. Each word arrives about a second after you stop speaking. It can mistake words that sound alike, such as sit and set.

The camera's picture and the microphone's sound stay on your computer and are never saved.

To drive with your whole body instead, see [Drive a robot with your camera](/help/drive-a-robot-with-your-camera).
