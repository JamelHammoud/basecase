---
title: Host Basecase Fleet
date: 2026-11-16
collection: operate
type: reference
covers:
  - src/fleet/service/
  - electron/fleet/
---

Run a PostgreSQL registry with local accounts, scoped access and a browser inventory for robots from different vendors.

## Service setup

Use the repository's pinned Node version and PostgreSQL. Install dependencies, then build the browser bundle:

```sh
npm ci
npm run build:web -- --outDir dist-web
```

Set these environment variables for your service account:

| Variable | Value |
| --- | --- |
| `FLEET_DATABASE_URL` | Your PostgreSQL connection URL |
| `FLEET_ORGANIZATION` | Your organization's display name |
| `FLEET_EMAIL` | Your first administrator's email |
| `FLEET_BOOTSTRAP_PASSWORD` | A password of at least 14 characters |

Run `npm run fleet -- bootstrap` locally. Save the printed organization ID, then remove `FLEET_BOOTSTRAP_PASSWORD` from the environment. Run `npm run fleet` to serve the browser entry at `http://127.0.0.1:7440/fleet`.

Outside loopback, set `FLEET_ORIGIN` to the service's HTTPS origin, `FLEET_TLS_CERT` to its certificate file and `FLEET_TLS_KEY` to its key file. `FLEET_BIND` chooses the listening address. The service requires TLS itself and doesn’t treat forwarded headers as a secure connection.

`FLEET_WEB_DIRECTORY` overrides `dist-web`. Migrations run before the service accepts requests. Restarting the service preserves accounts, roles, identities and observations in PostgreSQL.

## Accounts and roles

Administration uses the version 1 JSON API. The browser provides enrollment, sign-in, inventory and sign-out. Administration requires organization-level `iam.manage`.

`POST /v1/sessions` takes `org`, `email` and `password` and returns a session token. Send it as `Authorization: Bearer <token>` for subsequent API calls. Session tokens expire after 12 hours.

Create a site with `POST /v1/<org>/site` and a robot with `POST /v1/<org>/robot`. Both take `name` and optional string `attributes`. The robot also takes its site's UUID as `parent`. Nested sites take their parent site's UUID. Robots need no CAD scene.

Create a custom role with `POST /v1/<org>/role`:

```json
{
  "name": "Site viewer",
  "rules": [
    {
      "effect": "allow",
      "scope": "<site UUID>",
      "actions": ["inventory.view"],
      "conditions": {}
    }
  ]
}
```

`GET`, `PUT` and `DELETE /v1/<org>/role/<role>` read, replace or delete that role. List roles with `GET /v1/<org>/role`. A site's scope includes its descendants. `*` scopes the entire organization. Explicit denies override grants, and access is denied without a grant.

Conditions match string attributes. For example, `"conditions": { "site": { "country": ["US"] }, "robot": { "vendor": ["Acme"] } }` requires both attributes. Nested sites inherit attributes from their ancestors, with nearer values taking precedence.

Create an account with `POST /v1/<org>/account`, passing `name` and a `roles` array of role UUIDs. `POST /v1/<org>/invitations` takes `account` and `email` and returns a one-use enrollment token. Give the person the service's `/fleet/enroll#token=<token>` address. Invitations expire after 24 hours.

Groups use `POST /v1/<org>/group` with `name`, `members` containing account UUIDs and `roles` containing role UUIDs. Read, replace and delete groups through their ID paths. Role changes and revocation clear connected browser inventories and require a reload.

## Service credentials and observations

`POST /v1/<org>/credentials` takes a `rules` array and returns a scoped service token. It expires after 30 days and can’t exceed its issuing account's current access. `GET /v1/<org>/credentials` returns credential metadata with at most 100 records and a `next` cursor. Pass that cursor as `after` to read another page. `DELETE /v1/<org>/credentials/<credential>` revokes a credential. These paths also support revoking browser sessions and unused invitations.

The action names keep viewing, export, incident response, scheduling, deployment and robot control separate. Read the names and limits from `GET /v1/<org>/contracts`. The service doesn’t execute those robot operations.

For a studio publisher, grant only `status.publish` on the intended site or robots. Set `BASECASE_FLEET_CONFIG` to a private JSON file outside your scenes:

```json
{
  "origin": "https://fleet.example.test",
  "org": "<organization UUID>",
  "token": "<scoped service token>",
  "units": { "robot": "<registry robot UUID>" }
}
```

The studio allocates a connection generation and publishes timestamped observations. Duplicate event IDs and older connections can’t replace current status. A disconnect preserves the identity and records offline status. Status becomes stale after 60 seconds without an observation. Publisher failures don’t affect live robot control and aren’t retried.

Store credentials outside scenes and exports. Inventory pages contain at most 100 records. Subscriptions contain at most 100 robots and 256 KiB per snapshot. Registry capacity is separate from the studio's 32 live robot connections.

## Facility imports

Site viewers can read a registered facility. Uploads, registration and local USD conversion require `inventory.manage` on that site. Original source files, hashes and registration stay in PostgreSQL alongside the prepared geometry.

Install uv on the service host for local USD exports. Conversion uses the pinned reader in `electron/simready/` and prepares an environment in the service account's Basecase cache. Set `FLEET_USD_ENV_DIRECTORY` to choose another environment directory. Runtime installation can access the package registry. Asset dependencies must come from the uploaded package.

The service admits two preparations at once, with no pending queue. Source files must total at most 32 MiB across 256 files. The complete upload request must fit 64 MiB. USD conversion has a five-minute total deadline. Linux limits its address space to 3 GiB, and Windows applies a 3 GiB process-memory job limit. macOS keeps the byte, geometry and deadline caps without an OS memory ceiling.

Steps are in [Register a Fleet facility](/help/register-a-fleet-facility).

Use [Open Basecase Fleet](/help/open-basecase-fleet) to open the inventory as an enrolled account.
