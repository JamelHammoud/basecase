---
title: Restore Fleet administrator access
date: 2026-11-16
image: /changelog/recover-a-fleet-organization/cover.png
---

You can recover administrator access to an existing self-hosted Fleet organization from its service host. You need local database credentials and keep the original inventory.

If the last ordinary administrator loses their password or someone deletes their account, bootstrap would create another organization. Use the local recovery command to create a separate, protected administrator in the organization you identify by UUID.

You can’t remove this account or its role through ordinary identity edits, or use groups to add permissions or denies to it. Other accounts and custom roles keep their existing authorization rules.

During recovery, you rotate the local administrator’s password and revoke every session, service token and unused invitation in that organization. After recovery, reconnect publishers with new tokens. You supply passwords through local stdin without exposing them in command output.

You get PostgreSQL audit records for setup, recovery and protected edit refusals, with the actor, affected identity, time and outcome. Use the inspection command to read up to 100 records per page. Database administrators can change these records, so they aren’t proof against database tampering.

Steps are in [Recover a Fleet organization](/help/recover-a-fleet-organization).
