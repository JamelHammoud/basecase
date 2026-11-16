---
title: Federate Fleet identities
date: 2026-11-16
image: /changelog/federate-fleet-identities/cover.png
---

You can connect several SAML providers to one Basecase Fleet organization and provision their accounts through SCIM. Each provider keeps its own identity namespace and group grants.

In Fleet access settings, add a provider for each subsidiary or partner. A harbor operator can give two subsidiaries access to separate sites, even when both providers issue the same email and subject. Those people remain separate accounts.

Each organization supports 32 providers with up to three pinned signing keys per provider. During key rollover, Fleet accepts both the old and new signer. Disabling a provider revokes its sessions. Deactivating an account through SCIM clears its open inventory through its live subscription.

Fleet supports service-provider initiated Redirect requests and signed POST responses. Fleet does not support metadata downloads, IdP-initiated login or SAML logout. You can enforce SSO for an organization and keep the audited local recovery administrator. Robot credentials stay separate.

Setup and provisioning steps are in [Connect identity providers to Fleet](/help/federate-fleet-identities).
