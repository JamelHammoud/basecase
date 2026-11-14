---
title: Connect a robot computer
date: 2026-11-14
collection: operate
type: task
order: 5
keywords:
  - raspberry pi
  - jetson
  - linux
  - ssh
  - pairing
  - network
related:
  - connect-an-emulated-robot
  - export-a-robot-package
covers:
  - src/components/operate/AddRobotComputer.tsx
  - src/components/operate/NetworkRobotConnect.tsx
  - src/workspace/robotComputer.ts
  - electron/robot/robotInstall.mjs
  - electron/robot/networkRobotLink.mjs
  - tools/cli/basecase.mjs
---

Run the daemon on a Linux computer and connect to it over your local network, with the robot's joint map and calibration from your scene.

This needs the desktop app and a 64-bit arm64 or x64 Linux computer with SSH and systemd user services. Real motors stay locked.

The daemon runs emulated Feetech, Dynamixel, G1 or ROS 2 robots on that computer. It doesn't open motor hardware.
Installation requires bounded rotary joints whose ranges stay within one servo turn after applying their zeros and directions. Sliding joints and wheels without angular limits aren't accepted.

## Install from your scene

1. Open the robot's scene.
2. In **Play**, choose **Operate**.
3. Click **Add a Robot Computer**.
4. In **Host**, enter the computer's private address or host name.
5. In **User**, enter its SSH user.
6. In **SSH key**, enter your private key's absolute file path, or leave it blank to use your SSH agent.
7. Click **Install**.

![The robot computer form with Host, User and SSH key](/help/connect-a-robot-computer/setup.png)

Basecase checks the Linux architecture, downloads its daemon and verifies the checksum before copying it over SSH.
It installs `joint_map.json` and `calibration.json` from the scene, then starts a user service.
The service stays running after the SSH session ends.

The form shows the first pairing code and connects automatically. The connection starts at **Look**.
If the computer was already paired, Basecase reuses the saved key.

The SSH user needs permission to enable lingering with `loginctl enable-linger`, plus working `systemctl --user` and `journalctl --user` commands.
The installer reports a failure if those prerequisites are missing.

## Connect an installed daemon

1. In **Play**, choose **Operate**.
2. In **Robot**, choose the robot's name.
3. In **Pairing code**, enter the six-digit code printed by the daemon on its first start.
4. Click **Connect Robot**.

![Kitchen Arm selected in Operate with its pairing code entered](/help/connect-a-robot-computer/connect.png)

Enter the code once. Later connections use the key saved on both computers, so leave the code blank.
The pairing follows the robot when its IP address changes. If DHCP changes its address while the service is running, restart the service over SSH with `systemctl --user restart basecase-robot`, then reconnect.
Discovery uses the local network and doesn't reach robots over the internet. The connected robot must match the scene's joint order, IDs and robot class. ROS 2 connections must also match the scene's joint names and controller kind.

5. Under **Ladder**, click **Set Up**.
6. Click **Test**.

![The network arm in Test with its two joint readings](/help/connect-a-robot-computer/test.png)

The robot runs the same ladder and caps as an emulated robot connected directly to Basecase.
The daemon's watchdog detects missing heartbeats after 100 ms and starts the robot's stop plan.
An arm holds, a legged robot moves toward its standing pose, and the G1 returns control to its own controller.
A standing motion can take longer than the watchdog delay.

![Operate after the network connection drops](/help/connect-a-robot-computer/lost.png)

Reconnect from the same list after a drop. Every connection starts at **Look**, so climb the ladder again.

## Install from a terminal

From a Basecase checkout, export your scene and install its package:

```sh
basecase export robot.basecase --package robot
basecase robot install robot@kitchen-arm.local --package robot --key /home/user/.ssh/id_ed25519
```

You can use `--scene robot.basecase` instead of exporting a package first.
Without either option, the command reads `joint_map.json` from the current folder.
Use `--family unitree-g1` or `--family ros2` for those families.

The files live in `~/.local/share/basecase-robot` on the robot computer.
The user service is `basecase-robot.service`.
Its first-start code appears in the terminal output and the service log.

To check it on the robot computer, run `systemctl --user status basecase-robot`.
The installation command is also available as `node tools/cli/basecase.mjs robot install` from the checkout.

If you lose the paired computer's saved key, reset pairing on the robot computer over SSH:

```sh
systemctl --user stop basecase-robot
rm ~/.local/share/basecase-robot/pairing.json
systemctl --user start basecase-robot
journalctl --user -u basecase-robot --no-pager
```

This replaces the shared key. Pair again using the new code in the service log.

For the files that supply the joint map, see [Export a robot package](/help/export-a-robot-package).
