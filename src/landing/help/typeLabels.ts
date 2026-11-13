import type { ArticleType } from './helpArticle';

export const TYPE_LABELS: Record<ArticleType, string> = {
  task: 'How-to',
  concept: 'Concept',
  reference: 'Reference',
  troubleshooting: 'Troubleshooting',
};

export const TYPE_GROUPS: Record<ArticleType, string> = {
  task: 'How-to',
  concept: 'Concepts',
  reference: 'Reference',
  troubleshooting: 'Troubleshooting',
};
