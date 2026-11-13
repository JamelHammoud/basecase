export type ContentKind = 'blog' | 'help' | 'changelog';

export interface Section {
  kind: ContentKind;
  label: string;
  path: string;
}

export const SECTIONS: Section[] = [
  { kind: 'changelog', label: 'Changelog', path: '/changelog' },
  { kind: 'help', label: 'Help', path: '/help' },
];

const BLOG: Section = { kind: 'blog', label: 'Blog', path: '/blog' };

export const sectionsWithBlog = (hasPosts: boolean) => (hasPosts ? [...SECTIONS, BLOG] : SECTIONS);
