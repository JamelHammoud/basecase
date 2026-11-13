const SOFTWARE_RENDERERS = /swiftshader|llvmpipe|softpipe|software/i;

let software: boolean | null = null;

function probeContext(): WebGL2RenderingContext | null {
  if (typeof document !== 'undefined') return document.createElement('canvas').getContext('webgl2');

  return typeof OffscreenCanvas === 'undefined' ? null : new OffscreenCanvas(1, 1).getContext('webgl2');
}

function rendererName(gl: WebGL2RenderingContext): string {
  const info = gl.getExtension('WEBGL_debug_renderer_info');

  return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
}

export function softwareGl(): boolean {
  if (software !== null) return software;

  const gl = probeContext();

  software = Boolean(gl && SOFTWARE_RENDERERS.test(rendererName(gl)));
  gl?.getExtension('WEBGL_lose_context')?.loseContext();

  return software;
}
