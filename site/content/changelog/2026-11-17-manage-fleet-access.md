---
title: Manage accounts and scoped roles in Fleet
date: 2026-11-17
image: /changelog/manage-fleet-access/cover.png
---

You can create accounts, scoped roles and group grants in Fleet's existing Access page. Invite operators and revoke their sessions from the browser.

You can give a warehouse operator access to one site's inventory and keep another site private. Before this update, you had to create that role and account through API requests. In the browser, you edit the same resources and use the existing server policy evaluator.

You can give roles explicit allows and denies for multiple actions, choose organization or resource scopes, and set conditions on robot and site attributes. A matching deny overrides grants from other roles and groups. You can load 100 records per page and see UUIDs beside duplicate names.

Invitations expire after 24 hours, and you can use each one once. You can see enrollment links only after issuing invitations. Leaving the editor clears the links. You can view credential metadata in the lists and must confirm before revoking a credential. Operators with existing sessions use their current grants and lose access if you revoke their sessions.

You need organization-wide identity administration to manage access. You can't bypass protections for local recovery identities or SSO enforcement.

Steps are in [Manage Fleet access](/help/manage-fleet-access).
