---
title: Connect identity providers to Fleet
date: 2026-11-16
collection: operate
type: task
covers:
  - src/fleet/browser/FleetAccess.tsx
  - src/fleet/browser/FleetProviders.tsx
  - src/fleet/browser/FleetConnection.tsx
  - src/fleet/browser/FleetMappings.tsx
  - src/fleet/browser/FleetSso.tsx
  - src/fleet/service/saml.mjs
  - src/fleet/service/scim.mjs
---

You can connect subsidiaries and partners to one self-hosted organization and keep their identities and site grants separate.

You must have organization-wide identity administration access. Configure the service using [Host Basecase Fleet](/help/host-basecase-fleet) and roles using [Manage Fleet access](/help/manage-fleet-access).

1. In Fleet, click **Access**.
2. In **Provider name**, enter the subsidiary or partner name.
3. In **Issuer**, enter the identity provider's entity ID.
4. In **Sign-in URL**, enter its HTTP-Redirect SSO endpoint.
5. In **Signing certificates**, paste its PEM signing certificate or RSA public key.
6. Click **Save Provider**.
7. In **Access**, click the saved provider's name.
8. In your identity provider, set the audience to the **Entity ID** shown in Fleet.
9. In your identity provider, set the response endpoint to the **Assertion consumer URL** shown in Fleet.

![The first subsidiary with its own issuer, signing key and Harbor viewer role](/help/federate-fleet-identities/provider-1.png)

![Two configured subsidiaries and the second provider's SAML and SCIM endpoints](/help/federate-fleet-identities/access.png)

To connect another subsidiary, click **Add Provider** and repeat these steps. You can't change a provider's issuer after you create it.

## Grant access through groups

1. In **Access**, click the saved provider's name.
2. In **Group grants**, click **Add Group Grant**.
3. In **Provider group**, enter the asserted group name.
4. In **Fleet role**, choose the existing role to grant.
5. Click **Save Provider**.

The role list loads 100 definitions per page and shows UUIDs beside names. Use **Next Page** to select another page and **First Page** to return. Existing mapped roles outside that page appear by UUID.

To delete a mapping:

1. Beside the mapping, click **Delete**.
2. In the confirmation, click **Delete**.
3. Click **Save Provider**.

## Sign in through a provider

1. At `/fleet`, enter the organization UUID in **Organization ID**.
2. Click **Sign In with SSO**.
3. Click your provider's name.

You won't see providers from other organizations in this list.

![Sign-in showing only the selected organization's two subsidiaries](/help/federate-fleet-identities/discovery.png)

The two providers below issue the same subject and email. Their accounts remain separate, with access to different harbors.

![The first subsidiary viewing Inspection vessel 1 in Harbor 1](/help/federate-fleet-identities/scope-1.png)

![The second subsidiary viewing Inspection vessel 2 in Harbor 2](/help/federate-fleet-identities/scope-2.png)

## Provision accounts and groups

1. In the saved provider, click **Rotate SCIM Token**.
2. In your provisioning client, set the bearer credential to the value from **SCIM token**.
3. In your provisioning client, set the base URL to the displayed **SCIM URL**.
4. In each user's provisioning record, set `externalId` to their persistent SAML NameID.
5. In each group's provisioning record, set `externalId` to the name configured in **Group grants**.

The token lasts 30 days. Rotating it revokes the previous token. Fleet clears the displayed token when you leave the settings. Provisioned accounts use SCIM membership for group grants.

To revoke an account's sessions:

1. Through the SCIM Users endpoint, replace the user's `active` value with `false`.

Fleet clears the account's open inventory through its subscription.

![The deactivated second account with an empty inventory and Reload Fleet](/help/federate-fleet-identities/deactivated.png)

## Rotate signing keys and require SSO

You can pin up to three keys. Each time you save, Fleet revokes that provider's sessions and pending exchanges.

1. In **Signing certificates**, paste the old and new PEM keys.
2. Click **Save Provider**.
3. In your identity provider, switch to the new signer.
4. In Fleet, open the saved provider.
5. In **Signing certificates**, delete the old key.
6. Click **Save Provider**.

To require SSO:

1. On the service host, set up local recovery using [Recover a Fleet organization](/help/recover-a-fleet-organization).
2. In **Access**, click **Require SSO**.

Requiring SSO revokes ordinary local credentials and refuses password enrollment in that organization. The protected recovery account keeps password access. Other organizations keep their own policy.

To disable a provider:

1. In **Access**, open the saved provider.
2. Turn off **Enabled**.
3. Click **Save Provider**.

See the [Fleet federation protocol reference](/help/fleet-federation-protocol) for supported SAML bindings, SCIM operations and limits.
