export const NO_KERNEL_ERROR = 'The CAD kernel runs in the desktop app. Open this scene there to compile parts.';

const noKernel = () => Buffer.from(JSON.stringify({ ok: false, error: NO_KERNEL_ERROR }));

export const UNAVAILABLE = { render: noKernel, audit: noKernel, warm: () => {} };

export function serveKernel(bridge, kernel = UNAVAILABLE) {
  bridge.serve('kernel_render', (payload) => kernel.render(payload));
  bridge.serveRaw('kernel_audit', (body) => kernel.audit(body));
  bridge.serve('kernel_warm', () => {
    kernel.warm();

    return { ok: true };
  });
}
