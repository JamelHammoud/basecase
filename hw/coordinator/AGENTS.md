# hw/coordinator/

The Routine coordinator: one Rust crate, built natively for the robot and to WASM for the sim. Before editing here, read:

- [Routines](../../docs/guide/routines.md) (§8j)
- [Robot runtime](../../docs/guide/robot-runtime.md) (§8k)
- [Proof](../../docs/guide/proof.md) (§0k)

After changing anything in `src/`, run `npm run build:routines` and commit the new `src/routines/coordinator.wasm` with it. The rules in the root [AGENTS.md](../../AGENTS.md) apply here too.
