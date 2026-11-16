---
title: Open a shared robot inventory
date: 2026-11-16
image: /changelog/open-basecase-fleet/cover.png
---

You can keep robots from different vendors in Basecase Fleet, with shared organizations, nested sites and custom access roles. You host Fleet on your own PostgreSQL service.

Open it from Operate or the command palette. As a viewer for a hospital's Ward A, you can see that ward's delivery robots. You can't access Ward B. Robots with the same name have separate identities, and you don't need a CAD scene for a robot.

You can use roles to grant individual actions within a site or robot scope and match their attributes. Explicit denies override grants. You clear connected inventories when you revoke a session or change a role. Viewing inventory doesn’t grant export or robot control.

You retain timestamped studio observations after disconnects and service restarts. You see stale status after 60 seconds without an observation, and up to 100 records per inventory page. You must use HTTPS outside loopback. You can’t execute robot operations through Fleet.

For setup, read [Host Basecase Fleet](/help/host-basecase-fleet). For viewer steps, read [Open Basecase Fleet](/help/open-basecase-fleet).
