import React from 'react';
import { plural } from '../../../electron/plural.mjs';
import { PageTitle } from '../pages/PageTitle';
import { ArticleRows } from './ArticleRows';
import { ARTICLE_TYPES } from './helpArticle';
import type { HelpCollection } from './helpCenter';
import { HelpBreadcrumb } from './HelpBreadcrumb';
import { HelpSearch } from './HelpSearch';
import { SectionTitle } from './SectionTitle';
import { TYPE_GROUPS } from './typeLabels';

const groupsOf = (collection: HelpCollection) =>
  ARTICLE_TYPES.map((type) => ({
    type,
    articles: collection.articles.filter((article) => article.type === type),
  })).filter((group) => group.articles.length > 0);

export const HelpCollectionPage: React.FC<{ collection: HelpCollection }> = ({ collection }) => {
  const groups = groupsOf(collection);

  return (
    <>
      <HelpSearch className="mt-[40px]" />
      <PageTitle breadcrumb={<HelpBreadcrumb />}>{collection.title}</PageTitle>
      <p className="mt-[14px] text-[16px] leading-[1.55] text-white/60">{collection.description}</p>
      <p className="mt-[8px] text-[13px] text-white/50 tabular-nums">{plural(collection.articles.length, 'article')}</p>
      {groups.map((group) => (
        <section key={group.type} className="mt-[40px]">
          {groups.length > 1 && <SectionTitle>{TYPE_GROUPS[group.type]}</SectionTitle>}
          <div className={groups.length > 1 ? 'mt-[8px]' : ''}>
            <ArticleRows articles={group.articles} />
          </div>
        </section>
      ))}
    </>
  );
};
