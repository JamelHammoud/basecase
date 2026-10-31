export function installViewportProbes() {
  const counts = { calls: 0, draws: 0 };
  const frames = [];
  let frameWork = 0;

  const countDraw = (draws) => {
    counts.calls++;
    counts.draws += draws;
  };

  const wrap = (target, name, draws) => {
    const original = target[name];

    if (typeof original !== 'function') return;

    target[name] = function (...args) {
      countDraw(draws(args));

      return original.apply(this, args);
    };
  };

  const wrapContext = (gl) => {
    if (!gl || gl.__probed) return gl;

    gl.__probed = true;

    for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'])
      wrap(gl, name, () => 1);

    const getExtension = gl.getExtension.bind(gl);

    gl.getExtension = (name) => {
      const ext = getExtension(name);

      if (ext && name === 'WEBGL_multi_draw' && !ext.__probed) {
        ext.__probed = true;
        wrap(ext, 'multiDrawElementsWEBGL', (a) => a[6]);
        wrap(ext, 'multiDrawArraysWEBGL', (a) => a[5]);
        wrap(ext, 'multiDrawElementsInstancedWEBGL', (a) => a[8]);
        wrap(ext, 'multiDrawArraysInstancedWEBGL', (a) => a[7]);
      }

      return ext;
    };

    return gl;
  };

  for (const Canvas of [HTMLCanvasElement, globalThis.OffscreenCanvas].filter(Boolean)) {
    const getContext = Canvas.prototype.getContext;

    Canvas.prototype.getContext = function (type, ...rest) {
      const context = getContext.call(this, type, ...rest);

      return type === 'webgl2' ? wrapContext(context) : context;
    };
  }

  const raf = window.requestAnimationFrame.bind(window);

  window.requestAnimationFrame = (callback) =>
    raf((t) => {
      const start = performance.now();

      try {
        callback(t);
      } finally {
        frameWork += performance.now() - start;
      }
    });

  let last = performance.now();
  const tick = (t) => {
    frames.push({ t, interval: t - last, work: frameWork, calls: counts.calls, draws: counts.draws });
    last = t;
    frameWork = 0;
    counts.calls = 0;
    counts.draws = 0;
    raf(tick);
  };

  raf(tick);
  window.__viewportFrames = frames;
}

export const percentile = (values, p) => {
  if (!values.length) return 0;

  const sorted = [...values].sort((a, b) => a - b);

  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
};

export function summarizeFrames(frames) {
  const busy = frames.filter((f) => f.calls > 0);
  const pick = (key, p) =>
    Math.round(
      percentile(
        busy.map((f) => f[key]),
        p,
      ) * 100,
    ) / 100;

  return {
    frames: frames.length,
    rendered: busy.length,
    calls: pick('calls', 0.5),
    draws: pick('draws', 0.5),
    workP50: pick('work', 0.5),
    workP95: pick('work', 0.95),
    intervalP95:
      Math.round(
        percentile(
          frames.map((f) => f.interval),
          0.95,
        ) * 10,
      ) / 10,
    slowFrames: frames.filter((f) => f.interval > 20).length,
  };
}
