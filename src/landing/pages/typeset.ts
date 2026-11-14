const APOSTROPHE = /(\p{L})'(?=\p{L})/gu;
const CODE = /(```[\s\S]*?```|`[^`\n]*`)/;

export const typeset = (text: string) => text.replace(APOSTROPHE, '$1’');

export const typesetMarkdown = (markdown: string) =>
  markdown
    .split(CODE)
    .map((part, index) => (index % 2 ? part : typeset(part)))
    .join('');
