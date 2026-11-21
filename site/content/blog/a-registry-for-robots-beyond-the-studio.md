---
title: A registry for robots beyond the studio
date: 2026-11-16
---

We built Basecase Fleet so your organization can keep a shared robot inventory after the studio disconnects. You host it with PostgreSQL and open it in the browser. Read the [Fleet announcement](/changelog/2026-11-16-open-basecase-fleet) for what viewers can do.

## A disconnected robot still belongs somewhere

Consider a hospital with delivery robots in two wards. You need to see the inventory for Ward A without gaining access to Ward B. Two vendors may both call a model Acme. Closing a workstation’s connection shouldn’t erase either robot’s identity or change who can see it.

In Basecase, you could connect to a fleet of robots through the studio. We use that controller to manage daemon sessions, assign policies and operate robots, with a limit of 32 connections. Raising the limit wouldn’t give an organization a shared registry. Disconnected units with retained incident history stay in the studio's list, but that history is local to one computer.

We kept the controller and built a separate registry. Each organization, region, site and robot gets a durable identity, so you can reuse display names. You can include a third-party robot in the inventory without an editable CAD scene.

## Access follows resources

We chose custom roles for the first version because an administrator or viewer switch can’t express the boundary between wards. In a role, you specify actions and a resource scope. A site scope includes its descendants. You can set conditions that match site and robot attributes, and use groups to collect account membership and roles.

We use the same evaluator to check direct reads, list results, exports, text assets, mutations and status subscriptions. A matching deny overrides grants from all roles. For service credentials, we intersect the credential’s scope ceiling with the issuing account’s current access.

The service checks current credentials and roles before sending subscription data, so a connected browser doesn’t keep a permanent copy of its permissions. After a registry or credential change, the service resets the stream. The browser clears its inventory and requires a reload. You have to pause and reload before the inventory displays the resources you can still access.

## Observations need an identity of their own

The studio publisher sends bounded observations through a scoped service credential. It allocates a generation for each connection and includes an event identity and source timestamp in each update. An old connection can’t replace a newer connection’s status. Submitting the same event again doesn’t apply it twice.

We keep the last observation in PostgreSQL after disconnect. After 60 seconds without a new observation, Fleet marks the status stale. Publishing errors don’t affect robot control, and the publisher doesn’t retry failed requests. We keep credentials outside scenes and exports.

## Capacity has separate costs

We test with an acceptance fixture containing 10,000 robots across 100 sites. In the fixture, we send 100-event batches, traverse 100-record pages and consume bounded subscription snapshots. We record ingest throughput, query latency, bytes, process memory and database relation sizes. We keep the measured results and their limits in the subsystem’s evidence note.

These measurements cover registry operations on generated data. They don’t increase concurrent control capacity or prove a deployment with physical robots. The ten deployment fixtures represent inventory classes, including aerial, road, harbor and fixed appliances. We haven’t established operating outcomes for those deployments through these fixtures.

In this version, you administer accounts and roles through the API. In the browser, you can enroll, sign in and view inventory. To host Fleet, you need PostgreSQL and HTTPS outside loopback. Read [Host Basecase Fleet](/help/host-basecase-fleet) for the setup, credential and role contracts.
