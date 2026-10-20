export interface ColorRun {
  text: string;
  color?: string;
}

const HEX = /(?<![\w&#/])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi;

const isColor = (match: string) => match.length === 7 || match.length === 9 || /[a-f]/i.test(match);

export function splitHexColors(text: string): ColorRun[] {
  const runs: ColorRun[] = [];
  let last = 0;

  for (const match of text.matchAll(HEX)) {
    const start = match.index ?? 0;

    if (!isColor(match[0])) continue;

    if (start > last) runs.push({ text: text.slice(last, start) });

    runs.push({ text: match[0], color: match[0] });
    last = start + match[0].length;
  }

  if (last < text.length || runs.length === 0) runs.push({ text: text.slice(last) });

  return runs;
}

export const exactHexColor = (text: string) => {
  const runs = splitHexColors(text.trim());

  return runs.length === 1 && runs[0].color ? runs[0].color : null;
};
