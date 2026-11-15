# electron/visionTrainer/

The isolated local image-model trainer. Read [Cameras](../../docs/guide/cameras.md) (§8l), [Security](../../docs/guide/security.md) (§0h), [Windows](../../docs/guide/windows.md) (§0j) and the root [AGENTS.md](../../AGENTS.md) before editing.

`uv run --project electron/visionTrainer --frozen --exact python electron/visionTrainer/integration_test.py` runs the real offline optimization and ONNX parity checks. Set `UV_PROJECT_ENVIRONMENT` to a gitignored directory first.
