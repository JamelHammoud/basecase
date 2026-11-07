# Robot runtime

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 8k. Robot runtime

The daemon that owns motor writes, the servo emulators and the calibration tools, in `hw/`.

- **One write handle.** Only the safety layer can write to a motor.
- **Motors stay locked.** Real serial transport is compiled out of default builds until the Stage 8 session (§0k), because this code has never moved a motor.
- **`hw/emu/ledger.yaml` records where each emulated behaviour came from:** datasheet, client-derived, community or assumed.
