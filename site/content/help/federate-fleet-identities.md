---
title: Connect identity providers to Fleet
date: 2026-11-16
collection: operate
type: task
covers:
  - src/fleet/browser/FleetAccess.tsx
  - src/fleet/browser/FleetConnection.tsx
  - src/fleet/browser/FleetMappings.tsx
  - src/fleet/browser/FleetSso.tsx
  - src/fleet/service/saml.mjs
  - src/fleet/service/scim.mjs
---

You can connect subsidiaries and partners to one self-hosted organization and keep their identities and site grants separate.

You must have organization-wide identity administration access. Configure the service and roles using [Host Basecase Fleet](/help/host-basecase-fleet).

1. In Fleet, click **Access**.
2. In **Provider name**, enter the subsidiary or partner name.
3. In **Issuer**, enter the identity provider's entity ID.
4. In **Sign-in URL**, enter its HTTP-Redirect SSO endpoint.
5. In **Signing certificates**, paste its PEM signing certificate or RSA public key.
6. Click **Add Group Grant**.
7. In **Provider group**, enter the asserted group name.
8. In **Fleet role**, choose the existing role to grant.
9. Click **Save Provider**.
10. Click the saved provider's name to copy its entity ID and assertion consumer URL into your identity provider.

![The first subsidiary with its own issuer, signing key and Harbor viewer role](/help/federate-fleet-identities/provider-1.png)

![Two configured subsidiaries and the second provider's SAML and SCIM endpoints](/help/federate-fleet-identities/access.png)

To connect another subsidiary, click **Add Provider** and repeat these steps. You can't change a provider's issuer after you create it. To disable a provider, turn off **Enabled** and click **Save Provider**. To remove a grant, click **Delete** beside it and confirm, then save.

## Sign in through a provider

At `/fleet`, enter the organization UUID in **Organization ID**, then click **Sign In with SSO**. Choose your provider's name. You won't see providers from other organizations in this list.

![Sign-in showing only the selected organization's two subsidiaries](/help/federate-fleet-identities/discovery.png)

The two providers below issue the same subject and email. Their accounts remain separate, with access to different harbors.

![The first subsidiary viewing Inspection vessel 1 in Harbor 1](/help/federate-fleet-identities/scope-1.png)

![The second subsidiary viewing Inspection vessel 2 in Harbor 2](/help/federate-fleet-identities/scope-2.png)

## Provision accounts and groups

In the saved provider, click **Rotate SCIM Token**. Copy the value from the **SCIM token** field into your provisioning client and use the displayed SCIM URL. The token lasts 30 days. Rotating the token revokes the previous token. Fleet clears the displayed token when you leave the settings.

Set each user's `externalId` to that user's persistent SAML NameID. Set each group's `externalId` to the name you configured in Group grants. Fleet does not use email to link accounts. For provisioned accounts, Fleet applies group grants based on SCIM membership instead of asserted SAML groups.

Set `active` to `false` through the Users endpoint to revoke the account's sessions. Fleet clears the account's open inventory through the existing subscription reset.

![The deactivated second account with an empty inventory and Reload Fleet](/help/federate-fleet-identities/deactivated.png)

## Rotate signing keys and require SSO

Paste the old and new PEM keys into **Signing certificates** and save before changing the provider's signer. Remove the old key and save after the transition. You can pin up to three keys. Each time you save, Fleet revokes that provider's sessions and pending exchanges.

Set up [Recover a Fleet organization](/help/recover-a-fleet-organization) before clicking **Require SSO**. Requiring SSO revokes ordinary local credentials in that organization. You can continue to sign in to the protected recovery account with a password. Other organizations keep their own policy.

See the [Fleet federation protocol reference](/help/fleet-federation-protocol) for supported SAML bindings, SCIM operations and limits.
