# Basecase Fleet

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the guide index.

## 8n. Shared identity and inventory

Fleet is a self-hosted browser workspace and PostgreSQL service, separate from Operate's live `FleetRows`. `src/fleet/service/` owns persistence, accounts and the version 1 API. `src/fleet/browser/` owns the browser workspace. `electron/fleet/` publishes studio status. Existing rollout and twin modules under `src/fleet/` still belong to [Robot runtime](robot-runtime.md).

An organization owns regions, nested sites, robot identities, roles, groups, accounts and text assets. UUIDs identify everything. Display names and vendor names need not be unique. A robot belongs to a site and needs no scene, joints, mesh or editable CAD model. Inventory survives studio disconnects and service restarts. Parentage is fixed on creation. Names and attributes can change. Delete a site's children before deleting the site.

### Run the service

Use Node from `.nvmrc` and PostgreSQL 18, or the PostgreSQL installation supplied by Windows CI. Install the repository dependencies. Build the browser bundle with `npm run build:web -- --outDir dist-web`. The default static directory is `dist-web`, overridden by `FLEET_WEB_DIRECTORY`.

Set `FLEET_DATABASE_URL` to a PostgreSQL connection URL. Set `FLEET_ORGANIZATION`, `FLEET_EMAIL` and `FLEET_BOOTSTRAP_PASSWORD` and run `npm run fleet -- bootstrap`. This local database operation creates a separate organization and administrator and prints their IDs. Passwords require at least 14 characters. Bootstrap is never an HTTP endpoint. Remove the bootstrap password from the environment after use.

`npm run fleet` runs migrations and serves `http://127.0.0.1:7440/fleet`. Outside loopback, configure `FLEET_ORIGIN=https://fleet.example.test`, `FLEET_TLS_CERT` and `FLEET_TLS_KEY`. Origins without an explicit port listen on 443 for HTTPS or 80 for HTTP. `FLEET_BIND` chooses the listening interface. HTTP refuses nonloopback binds and peers, including a remote peer forging a loopback Host. HTTPS terminates in the service. Forwarded headers cannot substitute for TLS. Each request must match the configured Host. API requests require same-origin browser headers. Public app navigation can originate in the studio. Keep PostgreSQL and its credentials outside scenes and exports.

Operate's Fleet address field saves only the service origin on this computer. Open Fleet and the Operate command of the same name open its browser entry. The `/fleet` web entry loads before the small-screen landing decision. Fleet needs the self-hosted service, including when using the static web bundle. It is not a hosted service on the web demo.

### Version 1 API

All organization paths start with `/v1/<organization UUID>/`. JSON bodies are capped at 128 KiB. Errors disclose no database text or credentials. Browser sessions use an HttpOnly, SameSite=Strict cookie, with Secure on HTTPS. Automation uses `Authorization: Bearer <token>`. Neither browser sessions nor publisher tokens enter project data, scene storage or inventory exports.

| Path | Methods | Contract |
| --- | --- | --- |
| `/v1/sessions` | POST | Organization ID, email and password exchange for a 12-hour session |
| `/v1/enroll` | POST | A one-use enrollment token and new password exchange for a session |
| `/v1/me` | GET | Authenticated account, organization and credential IDs |
| `/v1/sessions/current` | DELETE | Revoke this session |
| `region`, `site`, `robot`, `role`, `group`, `account`, `asset` | GET, POST | Paginated enumeration or creation |
| `<kind>/<id>` | GET, PUT, DELETE | Read, replace name and attributes, or delete |
| `asset/<id>/content` | GET | Authorized text content, at most 32 KiB per asset |
| `invitations` | POST | Account ID and email produce a one-use, 24-hour enrollment token |
| `credentials` | POST, GET | Issue a scoped 30-day service token or enumerate credential metadata |
| `credentials/<id>` | DELETE | Revoke a session, service token or unused invitation |
| `generations/<robot>` | POST | Allocate the next persistent connection generation |
| `status` | POST | At most 100 identity-addressed status events |
| `subscribe` | GET | Authenticated SSE snapshots of at most 100 visible robots |
| `export` | GET | Paginated robot inventory with separate export authorization |
| `contracts` | GET | Version, action names and page and update limits |

Creation takes `name`, optional `attributes` and a parent ID where applicable. Accounts have `roles`. Groups have `members` and `roles`, each containing local UUIDs. Roles have `rules`. Each rule has `effect: allow|deny`, `actions`, `scope` and optional `conditions`. Scope is an organization-local resource UUID, including all descendants, or `*` for the organization. Conditions are `robot` and `site` maps from an attribute name to an array of allowed string values. Every condition must match. Site attributes inherit down nested sites, with the nearest site's value taking precedence. Robot conditions on a text asset use its ancestor robot.

The single evaluator is `authorization.mjs:allowed`. There are separate actions for inventory view, inventory management, export, incident response, work scheduling, software deployment, robot control, status publishing and identity management. A matching explicit deny beats every grant, including grants from another group. No grant means no access. Service scopes intersect the issuing account's current effective roles. Accounts may belong to at most 100 groups with at most 256 distinct effective roles. Exceeding these limits refuses authentication instead of dropping rules or denies. Identity administration requires organization-level `iam.manage`, including group membership, role edits and credential issuance. The API does not execute robot control, incidents, schedules or deployments.

For example, a site viewer's role can contain:

```json
{
  "name": "Ward viewer",
  "rules": [
    {
      "effect": "allow",
      "scope": "<site UUID>",
      "actions": ["inventory.view"],
      "conditions": { "site": { "country": ["US"] } }
    }
  ]
}
```

Send this to `POST /v1/<org>/role` using an administrator session. Create an account referencing the returned role UUID, then issue its invitation. The enrollment page is `/fleet/enroll#token=<enrollment token>`. Its fragment stays out of HTTP requests and is removed after the page opens. An invitation opens enrollment even when the browser already has a session. Completing it replaces that browser session with the invited account. Role and account administration are API operations. The browser workspace provides sign-in, enrollment, site selection, robot pages and sign-out.

### Enumeration and subscriptions

Lists, including credential metadata, use `after=<last UUID>` keyset cursors and return `{ items, next }`, at most 100 records per page. Candidate queries restrict organization, resource kind and grant scopes before applying the same evaluator to each result. Denied records and counts never appear. `robot?site=<UUID>` checks access to that site and includes its descendants. Exports use the same filtering with `inventory.export`. Passwords, token hashes, tokens and asset content are absent from those summaries.

PostgreSQL notifications drive status subscriptions. Each connection retains one pending refresh flag, never a growing event queue. A snapshot is capped at 100 robots and 256 KiB. Slow connections close when buffered output exceeds 256 KiB. The service permits 64 subscriptions and 128 HTTP connections. Every status refresh reauthenticates and reloads current roles and groups. Registry mutations reset organization subscriptions, including role and group changes. Credential revocation resets only streams using that credential. A reset contains no resource data and closes the stream. Issuing another session does not reset existing streams. The browser clears its inventory immediately and offers Reload Fleet. It closes EventSource on reset or error and does not schedule reconnection. Failed inventory requests also clear the rows. Late replies and subsequent refreshes cannot restore them before a reload.

### Studio adapter

Set `BASECASE_FLEET_CONFIG` to an operator-owned JSON file outside the library. It contains `origin`, `org`, `token` and `units`, a map from studio unit names to registry robot UUIDs. Issue the token with only `status.publish` on the intended site or robots. Keep this file private to the account running the studio. Renderer messages cannot change it.

`RobotFleet.onEvent` publishes only events from the current link. A connection allocates a persistent generation before publishing. Each update has a random event ID, source timestamp and generation. PostgreSQL ignores duplicate event IDs, older generations and older timestamps within one generation. A new generation can use a new source clock while retaining the previous observation until an update arrives. Timestamps more than 30 seconds in the future are refused. Disconnect writes offline status without deleting inventory.

The adapter keeps at most one active request and one newest pending observation per mapped robot, with at most 32 mappings. Unchanged status is sampled at most once a second. Connection and fault transitions publish immediately. Requests have a 5-second deadline, refuse redirects and cap replies at 4 KiB. Failures never affect robot control and are not retried. A failed observation does not strand a newer pending observation. Reconnecting discards the previous generation before allocation, so a later observation cannot reuse it after an allocation failure. Status becomes stale after 60 seconds without an observation. The browser advances this age locally every 10 seconds without polling the service. No Fleet token crosses IPC or the desktop HTTP bridge. The daemon connection cap stays at 32.

### Testing coverage and measurements

`tools/fleet/authorization.test.mjs` covers deny precedence, default denial, nested scopes, attribute conditions, cross-organization resources and credential ceilings. `service.test.mjs` runs the real HTTP service and PostgreSQL through role CRUD, group grants, account enrollment, token replay, revoked sessions, protected assets, subscriptions, stale observations, event deduplication, generation changes and restart persistence. `adapter.test.mjs` attaches an authenticated TCP loopback robot through `RobotFleet` and verifies persistent disconnect status and transport refusals. `registry.test.mjs` inventories the arc's ten deployment classes with duplicate vendor names and no CAD scenes.

`service.test.mjs` also traverses credential metadata beyond 100 records without duplicates or secret fields. `tools/fleet/http.test.mjs` checks listener ports for HTTP, HTTPS and explicit-port origins. `electron/fleet/studioPublisher.test.mjs` feeds failed allocation requests with newer disconnect and fault observations queued. `browser/useInventory.test.ts` holds replies across resets and errors, then exercises later refreshes and a failed request after a successful page.

`scale.test.mjs` seeds 10,000 identities across 100 sites, ingests 100-event batches, traverses keyset pages and consumes bounded subscription snapshots. It measures API bytes, throughput, query latency, process memory and PostgreSQL relation sizes without timing thresholds. Set `FLEET_MEASUREMENTS_FILE` to save the result outside git. The PostgreSQL fixture uses Docker on macOS and Linux, native PostgreSQL binaries on Windows, or `FLEET_TEST_DATABASE_URL`. It starts an isolated database and service from the test, so CI exercises the real persistence layer.

`e2e/fleet.e2e.test.ts` opens the browser entry through Operate as a site viewer, denies a forged request for another site and reopens inventory after restarting the service. It revokes the viewer's access and uses Reload Fleet to check the empty inventory. A separate test enrolls an invited account over an existing browser session in an explicit, isolated browser context, closed in cleanup. Its invitation email derives from the new account UUID. The fixture includes a loopback studio unit. The normal changed-e2e CI selection owns execution on the pull request. [Fleet evidence](../notes/fleet.md) records local measurements and remaining limits. [Runtime evidence](../notes/testing-robot-runtime.md#fleet-publisher) and [security evidence](../notes/node.md#fleet-authorization-boundary) record their respective boundaries.
