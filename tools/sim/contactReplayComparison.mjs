export function replayDifferences(given, native) {
  let drift = 0;
  let contactDifferences = 0;

  if (native.length !== given.expected.length) throw new Error('Contact replay sample counts differ.');

  native.forEach((sample, index) => {
    const expected = given.expected[index];

    if (sample.step !== expected.step) throw new Error('Contact replay sample steps differ.');

    if (JSON.stringify(sample.contacts) !== JSON.stringify(expected.contacts)) contactDifferences++;

    for (const field of ['qpos', 'qvel', 'poses']) {
      if (sample[field].length !== expected[field].length) throw new Error('Contact replay state sizes differ.');

      drift = sample[field].reduce((worst, value, i) => Math.max(worst, Math.abs(value - expected[field][i])), drift);
    }
  });

  return { drift, contactDifferences };
}
