export function measureParameterWork(name: 'prepare' | 'dispatch' | 'commit', started: number) {
  const key = `parameters:${name}`;

  performance.clearMeasures(key);
  performance.measure(key, { start: started, end: performance.now() });
}
