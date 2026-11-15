import type { MocapRotation } from './mocapBones';

export function bvhRotations(text: string, frameTime: number) {
  const hierarchy = text.split(/MOTION/)[0];
  const tokens = hierarchy.match(/(?:ROOT|JOINT)\s+\S+|CHANNELS\s+\d+[^\n\r]*/g) ?? [];
  const channels: Array<{ bone: string; axis: MocapRotation['axis']; index: number }> = [];
  let bone = '';
  let count = 0;

  for (const token of tokens) {
    const words = token.trim().split(/\s+/);

    if (words[0] !== 'CHANNELS') {
      bone = words[1];

      continue;
    }

    for (const channel of words.slice(2)) {
      if (/^[XYZ]rotation$/.test(channel))
        channels.push({ bone, axis: channel[0] as MocapRotation['axis'], index: count });

      count++;
    }
  }

  const data = text.split(/Frame Time:\s*[\d.eE+-]+\s*/)[1] ?? '';
  const frames = data
    .trim()
    .split(/[\r\n]+/)
    .map((line) => line.trim().split(/\s+/).map(Number));

  return (t: number) => {
    const frame = frames[Math.min(frames.length - 1, Math.max(0, Math.round(t / frameTime)))];
    const result = new Map<string, MocapRotation[]>();

    for (const channel of channels) {
      const list = result.get(channel.bone) ?? [];

      list.push({ axis: channel.axis, degrees: frame?.[channel.index] ?? Number.NaN });
      result.set(channel.bone, list);
    }

    return result;
  };
}
