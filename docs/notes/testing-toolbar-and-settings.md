# Toolbar and settings test evidence

Current coverage: [owning guide](../guide/toolbar-and-settings.md#testing-coverage). Shared policy and harness contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Printer settings copy

Issue #1480 inspected shipped source at `d65cd6315`, starting with recent Fleet registry (#1370), facility (#1396), classroom (#1468), grouped remote training (#1312), vision training (#1117) and Build Along changes. Their remaining explanations carry coordinate conventions, authorization or recovery information, budget sharing, provenance limits or hardware requirements. Those are retained. The same search across older current settings found two removable repetitions.

| Original revision and occurrence | Removed text | Simultaneously available context |
| --- | --- | --- |
| `d65cd6315`, `src/components/settings/PrintersPane.tsx:194`, last changed by #717 (`e8979c653`) | Add one by its address instead | The empty network-results card follows the printer card, whose last row offers Add Printer beside Find on Network. Add Printer opens the editor with its Address field when the chosen transport needs one. No printers found remains as the discovery result. |
| `d65cd6315`, `src/components/settings/PrinterEditor.tsx:94`, last changed by #701 (`85d95698b`) | Connection | The same row contains Test Connection, or Testing… while busy. The result message occupies its hint. Removing the static label preserves the named button, disabled busy state and complete success or failure message. |

These are the only current occurrences of these two strings in those roles. The retained connection transport explanations distinguish external slicer handoff from direct sending and describe LAN mode requirements. Build volume order, serial-number location, key fields and confirmation questions remain unchanged.

The three help articles flagged by preflight were read against the current code. `add-a-printer.md` retains its steps and drops its old printer screenshot, which still showed the removed Connection label, along with older Settings panes and captions. Its only image reference was in that article, so the unused image is removed too. `troubleshoot-build-printer-wont-connect.md` now locates feedback beside Test Connection, matching the shared row's horizontal layout. Its recovery steps and quoted messages still hold. `troubleshoot-build-slicing-fails.md` names unchanged Slicers, Add Printer, Print and plate controls. It contains no screenshots or references to either removed string, so it is left unchanged. Preflight continues to report that last article as an unchanged-help reminder, which explicitly permits leaving an accurate article alone.

Existing `e2e/print.e2e.test.ts` covers opening Settings from Add Printer in Print, adding a CORE One through Model, and finding and adding two network printers before Start Next. It does not change Send prints with or drive empty discovery or Test Connection replies. No existing exact-copy assertion names either removed string. Browser tests, deadlines, retries and quarantines are unchanged. Local verification is limited to the changed-file check. Linux and Windows browser execution belongs to CI and has not been observed in this session.

## Mark labels

The circle version took 50 s in run 43642970706 (#864).

## Training computer settings

The bridge test drops an identity path and extra credential fields from a malformed status reply. The route test checks configure and deselect through both transports. Static markup checks field names and the masked identity input. These tests do not establish SSH reachability, host-key verification or Forge execution. Those belong to the remote transport tests.

The help screenshots use a throwaway browser walkthrough with the same controlled remote boundary as `e2e/remoteTraining.e2e.test.ts`. It configures the computer in Settings, trains Stand, reloads the studio, reattaches with the same recovery key and receives a policy through the real local Arena worker. It does not run native training or SSH. The screenshots are captured without visual judgment. The development capture uses one isolated server with hot reload disabled, since concurrent renderer edits caused requests to an earlier disposed development server.

The final development screenshot walkthrough took 52.68 seconds. Its initial app load took 14.729 seconds, Settings configuration took 8.390 seconds, and scene loading plus rename took 1.689 seconds. Train dispatch took 1.488 seconds. Restart took 4.539 seconds and reattachment took 3.163 seconds. Local Arena took 15.766 seconds from delivery of the returned policy to the Try control becoming available. These are one development capture's wall times, including screenshots and unbundled modules, not CI measurements or native training throughput. The browser test installs its controlled event source on the current page and future loads, avoiding an extra fixture startup reload.

## Grouped training settings

The Training pane uses the existing segmented controls for Attempts and Concurrent attempts. Connect persists them alongside the selected computer. Active workflow entries freeze both choices, so changing Settings cannot resize a recovering group. The public status continues to omit the SSH identity. The browser walkthrough chooses two attempts, starts Stand, reloads and checks one workflow identity with two child identities. Remote completion and the local verdict are controlled in the browser. Native child identity and selection are tested separately, as described in [Skills evidence](testing-skills.md#grouped-remote-seeds).

The updated help images show the two-attempt configuration and aggregate progress. They were captured through the Settings and Train controls without visual judgment. The capture uses the existing e2e polling contract. No committed timeout, retry or browser harness policy changed.
