# Toolbar and settings test evidence

Current coverage: [owning guide](../guide/toolbar-and-settings.md#testing-coverage). Shared policy and harness contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Mark labels

The circle version took 50 s in run 43642970706 (#864).

## Training computer settings

The bridge test drops an identity path and extra credential fields from a malformed status reply. The route test checks configure and deselect through both transports. Static markup checks field names and the masked identity input. These tests do not establish SSH reachability, host-key verification or Forge execution. Those belong to the remote transport tests.

The help screenshots use a throwaway browser walkthrough with the same controlled remote boundary as `e2e/remoteTraining.e2e.test.ts`. It configures the computer in Settings, trains Stand, reloads the studio, reattaches with the same recovery key and receives a policy through the real local Arena worker. It does not run native training or SSH. The screenshots are captured without visual judgment. The development capture uses one isolated server with hot reload disabled, since concurrent renderer edits caused requests to an earlier disposed development server.

The final development screenshot walkthrough took 52.68 seconds. Its initial app load took 14.729 seconds, Settings configuration took 8.390 seconds, and scene loading plus rename took 1.689 seconds. Train dispatch took 1.488 seconds. Restart took 4.539 seconds and reattachment took 3.163 seconds. Local Arena took 15.766 seconds from delivery of the returned policy to the Try control becoming available. These are one development capture's wall times, including screenshots and unbundled modules, not CI measurements or native training throughput. The browser test installs its controlled event source on the current page and future loads, avoiding an extra fixture startup reload.

## Grouped training settings

The Training pane uses the existing segmented controls for Attempts and Concurrent attempts. Connect persists them alongside the selected computer. Active workflow entries freeze both choices, so changing Settings cannot resize a recovering group. The public status continues to omit the SSH identity. The browser walkthrough chooses two attempts, starts Stand, reloads and checks one workflow identity with two child identities. Remote completion and the local verdict are controlled in the browser. Native child identity and selection are tested separately, as described in [Skills evidence](testing-skills.md#grouped-remote-seeds).

The updated help images show the two-attempt configuration and aggregate progress. They were captured through the Settings and Train controls without visual judgment. The capture uses the existing e2e polling contract. No committed timeout, retry or browser harness policy changed.
