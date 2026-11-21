# src/cases/comparison/

Saved-source comparison preparation, indexed sampling and worker ownership. Read [Cases](../../../docs/guide/cases.md#comparison-preparation-coverage) before changing this area. Its measurements and limits live in [Recorded signals and playback](../../../docs/notes/performance-playback.md#saved-source-comparison-preparation).

Use the existing recording and topic formats. Keep source manifests, timestamps and hashes separate. Sampling and preparation remain framework-free and run in source-owned workers. Tests belong beside the pipeline they exercise. The root [AGENTS.md](../../../AGENTS.md) applies here.
