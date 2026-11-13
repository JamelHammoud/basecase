import React from 'react';
import { EntryImage } from '../pages/EntryImage';
import { PageTitle } from '../pages/PageTitle';
import { SiteMarkdown } from '../pages/SiteMarkdown';
import { ArticleRows } from './ArticleRows';
import type { ArticleType, HelpArticle } from './helpArticle';
import { HelpArticleMeta } from './HelpArticleMeta';
import { HelpBreadcrumb } from './HelpBreadcrumb';
import { collectionOf, collectionPath, neighbours, relatedTo, type HelpCenter } from './helpCenter';
import { helpComponents, HELP_PLUGINS } from './helpMarkdown';
import { HelpSearch } from './HelpSearch';
import { OnThisPage } from './OnThisPage';
import { PrevNext } from './PrevNext';
import { SectionTitle } from './SectionTitle';

const OUTLINE_FROM: Record<ArticleType, number> = { task: 3, concept: 3, reference: 2, troubleshooting: 2 };

export const HelpArticlePage: React.FC<{ center: HelpCenter; article: HelpArticle }> = ({ center, article }) => {
  const collection = collectionOf(center, article);
  const related = relatedTo(center, article);
  const { previous, next } = neighbours(center, article);

  return (
    <>
      <HelpSearch className="mt-[40px]" />
      <article className="relative" data-article-type={article.type}>
        <PageTitle
          breadcrumb={
            <HelpBreadcrumb collection={{ title: collection.title, href: collectionPath(collection.slug) }} />
          }
        >
          {article.title}
        </PageTitle>
        <HelpArticleMeta article={article} />
        {article.headings.length >= OUTLINE_FROM[article.type] && (
          <OnThisPage title="On this page" headings={article.headings} />
        )}
        {article.image && <EntryImage src={article.image} alt="" className="mt-[32px]" />}
        <SiteMarkdown
          className="mt-[32px] text-[16px] leading-[1.6] text-white/60"
          extraComponents={helpComponents(article.type)}
          extraPlugins={HELP_PLUGINS}
        >
          {article.body}
        </SiteMarkdown>
      </article>
      {related.length > 0 && (
        <section className="mt-[56px]">
          <SectionTitle>Related articles</SectionTitle>
          <div className="mt-[8px]">
            <ArticleRows articles={related} />
          </div>
        </section>
      )}
      {(previous || next) && <PrevNext previous={previous} next={next} />}
    </>
  );
};
