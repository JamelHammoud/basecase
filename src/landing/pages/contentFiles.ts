export const CONTENT_FILES: Record<string, string> = import.meta.glob('../../../site/content/*/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});
