import React from 'react';
import { formatDay } from '../pages/siteContent';
import type { HelpArticle } from './helpArticle';
import { TYPE_LABELS } from './typeLabels';

export const HelpArticleMeta: React.FC<{ article: HelpArticle }> = ({ article }) => (
  <p className="mt-[14px] flex flex-wrap gap-[12px] text-[13px] leading-[1.4] text-white/50 tabular-nums">
    <span>{TYPE_LABELS[article.type]}</span>
    <span>
      Updated <time dateTime={article.updated}>{formatDay(article.updated)}</time>
    </span>
  </p>
);
