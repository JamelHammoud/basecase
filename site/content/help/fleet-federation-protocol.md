---
title: Fleet federation protocol
date: 2026-11-16
collection: operate
type: reference
covers:
  - src/fleet/service/federationConfig.mjs
  - src/fleet/service/federationHttp.mjs
  - src/fleet/service/federationIdentity.mjs
---

Configure identity providers and provisioning clients against the service's exact SAML and SCIM contracts.

## SAML bindings

| Setting | Supported contract |
| --- | --- |
| Initiation | Service-provider initiated HTTP-Redirect AuthnRequest |
| Response | HTTP-POST to the provider-specific assertion consumer URL |
| Signing | Both Response and Assertion signed with RSA-SHA256 |
| Identity | Persistent NameID, keyed by organization, immutable issuer and subject |
| Audience | The exact provider-specific entity ID shown in Access |
| Destination and recipient | The exact provider-specific assertion consumer URL |
| Request lifetime | 5 minutes, correlated with a browser-bound RelayState |
| Assertion lifetime | At most 5 minutes, with zero clock skew allowance |
| Groups | Attribute named `groups`, at most 100 values |
| Providers | At most 32 per organization |
| Role mappings | At most 32 groups, each mapped to at most 8 existing organization roles |
| Key rollover | At most 3 pinned PEM certificates or RSA public keys, at least 2048 bits |

IdP-initiated responses, encrypted assertions, other signature algorithms, logout bindings, metadata downloads and XML metadata import are unsupported. Configure the issuer, endpoint and pinned keys directly. Fleet never fetches provider metadata. XML declarations for entities, document types, comments and CDATA are refused.

Issuer, audience, destination, recipient, signatures, validity and request correlation must all pass. Duplicate assertion identifiers and consumed requests are retained in PostgreSQL until their validity ends. They survive service restarts. At most 10,000 live cache entries are allowed per organization.

Group grants use the foundation's existing evaluator. Explicit denies retain precedence. For accounts without SCIM provisioning, a new SSO exchange replaces the asserted groups. Existing sessions use that latest snapshot. For provisioned accounts, SCIM membership is authoritative and changes apply to existing sessions.

An SSO assertion grants a browser session only. SSO sessions can’t issue service credentials. Robot pairing and publisher credentials use their existing separate contracts.

## SCIM subset

The base is `/scim/v2/<organization UUID>/<connection UUID>`. Send `Authorization: Bearer <SCIM token>` and JSON bodies. Tokens are limited to one connection in one organization. They can’t authenticate the inventory API.

| Endpoint | Operations |
| --- | --- |
| `Users` | POST with `externalId`, `userName`, `active` |
| `Users/<id>` | GET, PUT, PATCH and DELETE |
| `Groups` | POST with `externalId`, `displayName`, `members` |
| `Groups/<id>` | GET, PUT, PATCH and DELETE |
| Users and Groups lists | GET with `startIndex`, `count` and optional exact equality filter |

PATCH supports `replace` operations for User `active` and `userName`, and Group `displayName` and `members`. Each operation can name its path or supply an object value. Include the SCIM PatchOp schema. A patch contains at most 32 operations. Other patch operations and extension schemas are unsupported.

Filters support `externalId eq "value"`, `userName eq "value"` and `displayName eq "value"`. Lists return at most 100 entries per page. Bodies are capped at 128 KiB. Each connection supports 10,000 visible provisioned users and 10,000 groups. Group membership writes accept at most 100 distinct account IDs from the same connection. Passwords and role grants can’t be provisioned.

POST can adopt a SAML-created account with the same subject. It never adopts an account by email. User external IDs stay fixed. Deactivation revokes all account credentials and clears open inventory subscriptions. DELETE hides a user, removes its group memberships and retains an inactive identity tombstone. Groups are removed on DELETE.

Recovery revokes organization SCIM tokens and pending SAML exchanges with ordinary credentials. The protected local administrator and role can’t be provisioned or referenced by a mapping or group. Use [Connect identity providers to Fleet](/help/federate-fleet-identities) for setup and [Recover a Fleet organization](/help/recover-a-fleet-organization) for local recovery.
