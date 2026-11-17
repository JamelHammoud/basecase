---
title: Manage Fleet access
date: 2026-11-17
collection: operate
type: task
covers:
  - src/fleet/browser/FleetAccess.tsx
  - src/fleet/browser/FleetDirectory.tsx
  - src/fleet/browser/FleetIdentity.tsx
  - src/fleet/browser/FleetInvitation.tsx
  - src/fleet/browser/FleetRules.tsx
  - src/fleet/browser/FleetScope.tsx
  - src/fleet/browser/FleetGrants.tsx
  - src/fleet/browser/FleetCondition.tsx
  - src/fleet/browser/FleetConditions.tsx
  - src/fleet/browser/FleetCredentials.tsx
  - src/fleet/browser/FleetCredentialIssue.tsx
---

You can give an operator access to one site, invite them to enroll, and revoke credentials from the browser.

You must have organization-wide identity administration access. For sign-in instructions, see [Open Basecase Fleet](/help/open-basecase-fleet).

## Create a scoped role

1. In Fleet, click **Access**.
2. In **Resource**, choose **Roles**.
3. Click **Add**.
4. In **Name**, enter the role name.
5. Click **Add Rule**.
6. In **Effect**, choose **Allow** or **Deny**.
7. In **Scope resource**, choose the site by name and UUID.
8. In **Actions**, turn on the permissions to grant or deny.
9. Click **Save**.

![Warehouse viewer with inventory.view allowed on Warehouse west](/help/manage-fleet-access/role.png)

For organization-wide scope, choose **Organization**. Use **Scope kind** to select sites, regions, robots or assets. You can also enter a resource UUID or `*` in **Scope**.

To add an attribute condition:

1. In **Condition resource**, choose **Robot** or **Site**.
2. In **Attribute**, enter the attribute key.
3. Click **Add Condition**.
4. In the new condition, enter an allowed value.

To add another value, click **Add Value**. Every condition must match. An absent attribute doesn't match.

A matching deny overrides allows from every direct role, group and provider mapping. You can edit a rule without changing its other actions, conditions or unfamiliar attribute values.

## Create and invite an account

1. In **Resource**, choose **Accounts**.
2. Click **Add**.
3. In **Name**, enter the operator's display name.
4. In **Roles**, choose the scoped role.
5. Click **Save**.
6. In the account list, click the saved account's name and UUID.
7. In **Email**, enter the operator's email.
8. Click **Invite**.
9. Send the value in **Enrollment link** to the operator.

![Warehouse operator with a direct Warehouse viewer grant](/help/manage-fleet-access/account.png)

![The saved account with its enrollment link concealed](/help/manage-fleet-access/invitation.png)

The operator can use the link once within 24 hours. You can see it after you issue it and until you leave the editor. Fleet doesn't send email. The operator opens the link, enters a password of at least 14 characters and clicks **Enroll**. Operators with SSO-only accounts use their provider instead.

## Change group access

1. In **Resource**, choose **Groups**.
2. Click **Add**.
3. In **Name**, enter the group's display name.
4. In **Roles**, choose a role to grant.
5. In **Members**, choose an account.
6. Click **Save**.

![Warehouse operators with a Warehouse viewer role and local account membership](/help/manage-fleet-access/group.png)

To edit an existing group, click its name and UUID in the list, then change its grants and save. You can add multiple roles and members. To remove a grant, click its **Delete** button and confirm **Delete** before saving. You can save an empty group. For existing sessions, Fleet uses current grants on the next server request and clears open inventories when grants change.

You can view up to 100 records per page. Use **Next Page** for another page and **First Page** to return. You can still see the UUID of a selected grant outside the current page. Records with duplicate names remain separate.

## Revoke a credential

1. In **Resource**, choose **Credentials**.
2. Beside the credential UUID, click **Revoke**.
3. In the confirmation, click **Delete**.

![Credential UUIDs, account UUIDs, kinds, expiry dates and Revoke controls](/help/manage-fleet-access/credentials.png)

You can revoke sessions, service credentials and unused invitations. If you revoke a session, Fleet clears its open inventory and refuses further requests.

To issue a service credential, configure its **Rules** in **Credentials** and click **Issue Credential**. Copy **Service token** before leaving the page. You can use it for 30 days, within the issuing account's current access. You can't issue service credentials from SSO sessions.

You keep your draft after an ordinary validation failure. If Fleet denies an administrative action or revokes your session, it clears Access and stops writes. You can't edit, delete, invite or add protected recovery accounts and roles to grants.

Use [Connect identity providers to Fleet](/help/federate-fleet-identities) for SAML mappings and SCIM, or [Recover a Fleet organization](/help/recover-a-fleet-organization) for local recovery.
