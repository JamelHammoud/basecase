import React from 'react';
import { PageTitle } from '../pages/PageTitle';
import { ArticleRows } from './ArticleRows';
import { CollectionGrid } from './CollectionGrid';
import { collectionOf, type HelpCenter } from './helpCenter';
import { HelpSearch } from './HelpSearch';
import { SectionTitle } from './SectionTitle';

export const HelpHome: React.FC<{ center: HelpCenter }> = ({ center }) => (
  <>
    <PageTitle>Help</PageTitle>
    <HelpSearch className="mt-[28px]" />
    <section className="mt-[56px]">
      <SectionTitle>Collections</SectionTitle>
      <div className="mt-[16px]">
        <CollectionGrid collections={center.collections} />
      </div>
    </section>
    {center.popular.length > 0 && (
      <section className="mt-[56px]">
        <SectionTitle>Popular articles</SectionTitle>
        <div className="mt-[8px]">
          <ArticleRows articles={center.popular} meta={(article) => collectionOf(center, article).title} />
        </div>
      </section>
    )}
  </>
);
