# Roboflow importer evidence

Owning guide: [Cases, imported image datasets](../guide/cases.md#imported-image-datasets). Download boundaries: [Security](../guide/security.md).

## Pending version continuation

On 2026-11-28 the original importer treated every successful HTTP response except `ready: false` as an archive link. An HTTP 202 progress reply reached archive validation with an absent link. Explicit preparation threw an error and discarded the version selected from an unversioned project. Reimporting could therefore choose a newer version.

`electron/roboflow/pending.test.mjs` drives the main-process importer through `e2e/fakeRoboflow.ts`. Its matrix covers HTTP 202 with progress, HTTP 202 without progress, `ready: false`, progress without a link, repeated preparation, completion, latest-version changes, explicit version continuation, malformed responses and hostile archive URLs. Existing `roboflow.test.mjs` retains immediate completion, missing keys, sealing, secret exclusion, redirect and byte-cap coverage. Pending replies make zero archive requests. Each continuation adds exactly one export request and never repeats project resolution. Completion adds one archive request, with no saved API key.

The pending fixture for workspace/project version 2 retains 186 JSON bytes without progress, 199 at progress 0, 200 at 42 and 201 at 100. A fixture with both slugs at their 128-character cap, version 999999 and progress 99.12345678901234 retains 460 bytes. Assertions bound retained fixture replies below 512 bytes. Provider extras and account keys are excluded. No per-import state is retained in the main process, only one random signing secret per account service.

HTTP route and IPC registration tests preserve the same pending identity and produce base64 and typed-array completion respectively. Renderer tests preserve pending metadata without constructing an archive Blob. Modified workspace, project, version, format, signature or extra identity fields are rejected before a request.

`src/workspace/useDataImport.test.ts` checks pending replies never enter the reader or persistence, and cancellation drops late archive and worker results. `src/roboflow/importCancellation.test.ts` holds a real fake-server export response, cancels its activation, releases completion and checks the importer never opens a decoding worker. Scene changes and sheet closure invalidate the same activation through component cleanup. A dataset write already started retains its original scene context, and a late write cannot open a dataset in the replacement scene.

`e2e/imageImport.e2e.test.ts` declares the entry-point walkthrough: import a local COCO folder, follow missing-key navigation, enter an unversioned Roboflow link, receive preparation, advance latest from 2 to 9, continue and open the original dataset. Version-specific fake archives distinguish the original cup and plate classes from the newer archive. It asserts the complete request path sequence, no pending archive request, local secret exclusion and duplicate-content reuse. The response matrix stays in fast tests. Browser acceptance runs in CI, not locally.

Help captures use the real Import Robot, Accounts and Library interaction with the fake server. The capture-only scratch run completed in 22.61 seconds and saved pending and completed states through `captureArticle`. Captures were made for documentation without visual judgment. No real account, credentials, inference service or robot was used. Linux and Windows execution remains assigned to CI. No test quarantine or retry was added.

The final focused check passed formatting, lint, documentation links, site copy, TypeScript and 117 tests across 18 related files. The site check covered 394 pages. The browser walkthrough remains declared for CI.
