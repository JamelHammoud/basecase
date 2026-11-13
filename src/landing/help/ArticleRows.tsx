import React from 'react';
import { entryPath } from '../pages/siteContent';
import type { HelpArticle } from './helpArticle';

interface ArticleRowsProps {
  articles: HelpArticle[];
  meta?: (article: HelpArticle) => string;
}

export const ArticleRows: React.FC<ArticleRowsProps> = ({ articles, meta }) => (
  <ul className="list-none m-0 p-0 flex flex-col">
    {articles.map((article) => (
      <li key={article.slug} className="border-t border-white/[0.06] first:border-0">
        <a href={entryPath(article)} className="group flex flex-col gap-[4px] py-[16px]">
          <span className="flex items-baseline justify-between gap-[16px]">
            <span className="text-[16px] leading-[1.35] font-medium text-white/90 group-hover:underline underline-offset-2">
              {article.title}
            </span>
            {meta && <span className="shrink-0 text-[13px] text-white/50">{meta(article)}</span>}
          </span>
          {article.summary && <span className="text-[14px] leading-[1.5] text-white/60">{article.summary}</span>}
        </a>
      </li>
    ))}
  </ul>
);
