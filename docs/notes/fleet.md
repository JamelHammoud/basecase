# Fleet registry evidence

Implementation and current coverage: [Fleet](../guide/fleet.md). Runtime coverage: [Robot runtime](../guide/robot-runtime.md#fleet-publisher). Security boundary: [Node-side evidence](node.md#fleet-authorization-boundary).

## Generated registry measurement

The local acceptance run uses the pinned Node runtime and PostgreSQL 18 in Docker on macOS. `tools/fleet/scale.test.mjs` seeds 10,000 robot identities across 100 sites. Its ten repeated deployment classes include warehouse, factory, hospital, cleaning, agriculture, quadruped inspection, aerial, road, harbor and kitchen inventories. Vendor names deliberately repeat. Seed construction writes through PostgreSQL, outside the measured ingest interval. All measured updates and reads use the authenticated HTTP API and its real authorization evaluator.

The run sends 100 batches of 100 observations through a scoped service token and consumes a status subscription concurrently. It traverses all identities using keyset pages of at most 100 records. An additional empty page terminates an exact multiple of the page size. The subscription also stays at most 100 records per snapshot. It is a bounded current-inventory subscription, not a replay log.

The test records cumulative UTF-8 JSON bytes. API transfer figures exclude HTTP framing, request headers and TLS overhead. Query timings include authentication, authorization, SQL, JSON serialization and the loopback HTTP round trip. The service, client and Vitest share a Node worker, so process memory includes all three and the seeded fixture. PostgreSQL relation sizes include table indexes. No memory figure isolates a production service process or measures PostgreSQL resident memory.

The reproducible command is `FLEET_MEASUREMENTS_FILE=scratch/fleet-measurements.json npm run check:changed -- tools/fleet/scale.test.mjs`. It has no performance threshold. Measurements are local observations, not a production capacity promise, remote WAN measurement or CI result. Registry capacity does not change the 32 concurrent studio control connections.

## Local result on 16 November 2026

Apple M5 Pro, 24 GiB host memory, Node 26.13.0, PostgreSQL 18 in Docker. The server and HTTP client run in one Vitest worker. A single subscription consumes bounded snapshots during ingestion.

| Measurement | Result |
| --- | --- |
| Identities and sites | 10,000 and 100 |
| Accepted status observations | 10,000 |
| Measured ingestion | 989.16 ms, 10110 observations/s |
| Status request JSON | 1,690,100 bytes |
| Page latency, median / p95 | 4.44 / 6.50 ms |
| Inventory page JSON, cumulative | 3,938,724 bytes |
| Subscription snapshots | 101, each at most 100 records |
| Subscription JSON, cumulative | 3,771,142 bytes |
| Worker RSS, before / after | 137,150,464 / 212,713,472 bytes |
| Worker used heap, before / after | 25,817,032 / 45,160,104 bytes |
| Resource relations and indexes | 4,923,392 bytes |
| Status relations and indexes | 1,622,016 bytes |
| Event relations and indexes | 2,375,680 bytes |

The complete sample distribution is a local scratch artifact. The command above regenerates it. These measurements have no comparison baseline and establish no throughput improvement over another system. Subscription refresh coalescing can change the snapshot count between runs.

## Coverage and boundaries

The authorization matrix and service integration tests cover two organizations, nested sites, custom grants and denies, attribute conditions, groups, protected assets, revoked sessions and subscription invalidation. Attribute-conditioned management checks both the current and proposed record, preventing an update from moving a resource outside its granted attribute values. The same checks apply when creating a resource.

The persistence test closes the service and its database pool, opens a new pool, reruns migrations and reopens inventory. PostgreSQL remains running during this test. It proves service restart persistence, not database backup restoration or crash recovery. Old connection generations cannot publish. The previous observation remains until a new generation sends an observation, including its original timestamp.

The loopback adapter test covers an authenticated protocol peer through the studio's real connection worker. It does not run a physical device. The browser e2e is committed for the existing Linux and Windows CI selection. Documentation captures exercise enrollment, sign-in, a site viewer and access reset through Open Fleet, without judging appearance. The capture passed while its Vite harness reported delayed shutdown. It is not a packaged-build e2e result.

Remaining limits include API-only role administration, fixed parentage after identity creation, text-only assets, snapshots of at most 100 robots, 64 service subscriptions, 128 HTTP connections and no automatic reconnection after an access reset. Publisher state is bounded per robot and replaces pending observations with the newest value. Failed network requests are not retried or buffered on disk. Event identities are retained in PostgreSQL and grow with received unique observations from the current generation. No retention or backup policy is supplied.

The ten deployment fixtures prove heterogeneous inventory identities and access, not scheduling, incident response, navigation, metrics attribution or deployment execution. No SAML, SCIM, paid service, remote TLS installation, mobile device or physical robot was used.

## Review corrections

The publisher failure probe in `scratch/review-probes.mjs` left one pending disconnect and no active request after an allocation failure. The publisher now processes each newer pending observation independently and discards an old generation before reconnect allocation. Fast regressions hold the failed request while queuing disconnect and fault transitions. They assert the transmitted status and generation without retries or timing waits.

The browser hook tests hold inventory replies across subscription resets and errors, then invoke a later refresh. They also fail a request after loading rows. Both paths keep rows cleared until Reload Fleet. The listener test intercepts binding to check default HTTP and HTTPS ports without opening privileged ports or claiming a TLS deployment. The PostgreSQL integration traverses more than 100 credentials and checks complete, unique metadata pages without secret fields.

The enrollment walkthrough and access-reset reload assertions are committed for CI. They were not run locally during review. The earlier local capacity figures above are unchanged and do not measure these corrections.

The final review `check:changed` run passes on all 18 changed files, including formatting, lint, types, documentation, site copy and 120 tests across 22 files. Test execution took 4.44 seconds. The log is `scratch/review-check-final.log`. The shared dependency directory lacked the new PostgreSQL client, so review installed the locked client into scratch and used local dependency links without modifying the shared installation.

## Pull request 1370 CI correction

The 16 November Linux changed-e2e run passed the Operate inventory walkthrough in 6.55 seconds. Enrollment failed before browser navigation because `app.page.context().newPage()` tried to add a page to Playwright's single-page convenience context. Its automatic rerun then failed with HTTP 400 when issuing an invitation for the same email left by the first attempt. The enrollment test now owns an explicit browser context and closes it in `finally`. The email includes the newly created account UUID to avoid collisions across attempts. Enrollment assertions and timing budgets are unchanged. CI owns browser execution, so this correction has no local browser pass claim.

The copy job independently failed because the pull request body omitted a reason for the existing Reload Fleet button. The answer now includes that reason. The aggregate check failed on those two jobs, while its three required fast jobs passed.

## Inventory scrolling and identity reads

Review found that the shared studio stylesheet locks scrolling on the document and root. Fleet previously used an expanding main element, leaving lower inventory rows unreachable. Its main element now owns scrolling within the viewport and mounts the shared overlay scrollbars. The Operate browser walkthrough seeds 31 visible robots and asserts that scrolling to the last row moves the main container. CI owns this browser assertion.

Direct account, group and role reads previously evaluated `iam.manage` on the target resource, while identity lists and writes required organization-level access. A scoped identity grant could therefore read a record that it could neither enumerate nor manage. Writes checked only the organization, allowing an organization grant to bypass a deny on the individual identity. Direct reads and writes now require both organization-level access and a grant on the target resource, preserving deny precedence. The service integration regressions check all three kinds with scoped grants, explicit resource denies and an organization administrator.

The correction's fast check passed formatting, lint, types, documentation, site copy and 41 related tests across 12 files. The related-test run reported 5.11 seconds. Its log is `scratch/review-check-final.log`. The PostgreSQL client was installed under scratch and linked into a local dependency directory, leaving the shared installation unchanged. The browser scrolling assertions remain for CI, with no local browser pass claim.

## Nightly Linux browser quarantine

[Nightly Check 43844795005](https://github.com/JamelHammoud/basecase/actions/runs/43844795005), at `65ded0ef06580e2147b64e3d0626770378bf5701`, failed the Operate inventory walkthrough in Linux shard 4. The first attempt reached the final `app.errors` assertion at line 100 after its inventory, scrolling, cross-site refusal, service restart and access-reset assertions completed. It recorded 78 `net::ERR_NETWORK_CHANGED` failures loading JavaScript assets from the studio bundle server. The automatic rerun exhausted the existing 30000 ms action deadline filling Organization ID at line 74. Enrollment passed in 515 ms. Vite also reported two servers still open after its existing 10000 ms shutdown deadline, as it did after the unrelated quarantine observation later in the same job.

[Changed-e2e Check 43839831222](https://github.com/JamelHammoud/basecase/actions/runs/43839831222) passed the same walkthrough on Linux in 7945 ms and enrollment in 1449 ms at PR #1370's final revision `1752d1b1629626616148a64b2c53ab5f3a7cde52`. The Fleet test, browser modules, PostgreSQL fixture, shared browser harness, lockfile and e2e configuration have no diff between that revision and this repair checkout. Fleet arrived in `6333a4b8e` after the last full green run, `acb6bad2f3fb2acc770cdb2f885415d14c086a67`. The available evidence identifies intermittent Linux browser failure, not a later merge that can be cleanly reverted to fix it.

The file shares its app, cookies, database and viewer roles through `beforeAll`. The first attempt signed in and removed the viewer's roles before its error assertion failed. A rerun therefore starts with an authenticated session and changed permissions, explaining why the sign-in field can be absent. Popup cleanup occurs only on the success path. These state leaks are secondary to the original network-change failure. The log does not establish what triggered the network notification. Docker interface changes are a hypothesis, not a demonstrated cause. No runtime, fixture topology, error filter, assertion, retry count or timeout changes are justified by this evidence.

Only `opens Fleet from Operate, restricts a site viewer and reopens persistent inventory` is quarantined on Linux until 28 November 2026. Enrollment and the walkthrough on other platforms remain active. Fast service and authorization tests still cover scoped enumeration, cross-site denial, subscriptions, access revocation and persistence through service restart. Linux's regular browser run temporarily lacks the combined Operate, scrolling and persistent-inventory walkthrough, which remains in quarantine observations.

[#1386](https://github.com/JamelHammoud/basecase/issues/1386), labelled `loop:fix`, `loop:next` and `loop:priority`, owns tracing from browser startup, request failures, network notifications, Docker lifecycle, popup navigation and session state. Restoration requires an established initial cause, isolated attempt state and cleanup, unchanged behavioral assertions and at least 10 baseline and 10 candidate Linux runs at the same load with retries disabled. Repair performed no local browser runs or flake-rate measurements. Retained evidence is in `scratch/fleet-failure.log` and `scratch/fleet-green.log`.

## Windows PostgreSQL launcher handles

[Nightly Check 43844795005](https://github.com/JamelHammoud/basecase/actions/runs/43844795005) failed all four PostgreSQL-backed unit suites during their unchanged 10-second setup hooks. Windows browser shard 4 also exhausted its 120-second Fleet setup hook before either browser assertion ran. The scale suite's undefined `fixture.pool` error followed its failed setup. Linux's database integration suites passed at that revision. Fleet arrived in `6333a4b8e` after the last full green Check at `acb6bad2f3fb2acc770cdb2f885415d14c086a67`. Reverse application conflicts with subsequent Fleet guide and evidence edits, so this repair retains Fleet and fixes its Windows fixture.

A single-worker [Windows diagnostic](https://github.com/JamelHammoud/basecase/actions/runs/43847279395), ticket `ba9f5b6d-db47-43ec-86cb-76254cff0b78`, reproduced the registry setup timeout at the failed revision, with retries disabled. Its manifest records Windows image `20261103.298.1`, Node 26.13.0, four CPUs and 10.624 seconds for the test process. This is a platform startup regression, without evidence that any inventory assertion failed.

The fixture previously awaited promisified `execFile` for `pg_ctl`. PostgreSQL's [Windows launcher source](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/bin/pg_ctl/pg_ctl.c) explicitly inherits standard handles and starts a shell that remains with the server. File redirection inside that shell does not remove the shell's inherited handles. Waiting for captured pipe closure can therefore outlive the launcher. The replacement uses ignored stdin and file descriptors for stdout and stderr, then waits for launcher exit. Command logs live beside the data directory so `initdb` still receives an empty cluster directory. A nonzero or interrupted command includes the last 8,000 characters of diagnostic output and closes the local log handle.

A local process probe reproduced the ownership boundary with a launcher and a live descendant inheriting its standard handles. At launcher exit the old `execFile` callback was still pending until the descendant was released. The replacement completed before that release. This demonstrates the pipe ownership mechanism, not a post-change Windows PostgreSQL pass. Source and output are retained in `scratch/postgres-handles-probe.mjs` and `scratch/postgres-handles-probe.log`. `postgresCommand.test.mjs` checks launcher exit without a close event, file-backed diagnostics, nonzero and interrupted exits and failed spawn. `postgres.test.mjs` controls the Windows platform and commands while checking the complete start and stop arguments, separate cluster and log paths, and removal after stopping. Changed-file CI runs the related unit tests on Linux. This repair changes no browser test file, so it selects neither Fleet walkthrough for pull request CI. Native Windows startup and both Windows browser walkthroughs remain for nightly CI. No Fleet timeout, assertion or quarantine was changed in this repair, including the earlier Linux-only inventory quarantine.
