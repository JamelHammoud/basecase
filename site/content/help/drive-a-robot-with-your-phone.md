---
title: Drive a robot with your phone
date: 2026-11-13
collection: simulate-and-train
type: task
keywords:
  - phone
  - iphone
  - android
  - tilt
  - qr code
  - teleop
  - remote
related:
  - drive-a-robot-in-the-simulation
  - try-a-case
covers:
  - src/phone/phoneDrive.ts
  - src/phone/phoneStore.ts
  - src/phone/phoneLink.ts
  - src/components/phone/PairPhoneHost.tsx
  - src/workspace/inputCommands.tsx
  - electron/phone/phonePairing.mjs
  - electron/phone/phonePage.mjs
---

Steer a rover, a walking robot or an arm in the simulation by tilting your phone, with a touch pad and two buttons on its screen.

Pairing works in the desktop app, with the phone on the same network as the computer. The web studio can't open a network socket, so it doesn't offer it.

1. Open a scene with a robot, press ⌘K and choose **Pair Phone**.
2. Scan the code with your phone's camera and open the link.
3. Continue past the warning that the connection isn't private. Basecase makes a new certificate for each pairing, so no browser knows it.
4. Tap the page once. On an iPhone, allow access to motion and orientation.
5. On the computer, the code closes once the phone connects. Click **Simulate**, then **Drive**.
6. Tilt the top of the phone down to go forward, and its left edge down to turn left.
7. When you're done, press ⌘K and choose **Unpair Phone**.

![Pair Phone in ⌘K, with a rover in the scene](/help/drive-a-robot-with-your-phone/command.png)

![The pairing code over the canvas](/help/drive-a-robot-with-your-phone/code.png)

![The phone's page: Tilt to drive, a touch pad, and the A and B buttons](/help/drive-a-robot-with-your-phone/phone.png)

Press Esc while the code shows to stop pairing. A pairing nobody joins ends after 5 minutes.

## What each input does

| Input | Rover | Walking robot | Arm |
|---|---|---|---|
| Tilt forward and back | Drive forward and back | Walk forward and back | Move the hand forward and back |
| Tilt left and right | Turn | Turn | Move the hand left and right |
| Touch pad, sideways | | Step sideways | |
| Touch pad, up and down | | | Raise and lower the hand |
| A | | | Close the gripper |

A phone held within 4° of level counts as still, and a 25° tilt is full speed. If the phone locks or the page closes, the robot stops within half a second. Closing the page also ends the pairing.

A connected phone takes over from a gamepad and the keys while it's tilted. Each press of A or B is also an event named `phone` with the value `a` or `b`, which a Case's logic can react to, as in [Build a routine](/help/build-a-routine).
