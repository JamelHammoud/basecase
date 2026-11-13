import React from 'react';
import { collectionPath, countLabel, type HelpCollection } from './helpCenter';

export const CollectionGrid: React.FC<{ collections: HelpCollection[] }> = ({ collections }) => (
  <ul className="list-none m-0 p-0 grid grid-cols-1 sm:grid-cols-2 gap-[8px]">
    {collections.map((collection) => (
      <li key={collection.slug} className="flex">
        <a
          href={collectionPath(collection.slug)}
          className="flex-1 flex flex-col p-[20px] rounded-[12px] bg-white/[0.04] transition-colors duration-150 hover:bg-white/[0.07]"
        >
          <span className="text-[16px] leading-[1.35] font-semibold text-white/90">{collection.title}</span>
          <span className="mt-[6px] text-[14px] leading-[1.5] text-white/60">{collection.description}</span>
          <span className="mt-auto pt-[14px] text-[13px] text-white/50 tabular-nums">
            {countLabel(collection.articles.length)}
          </span>
        </a>
      </li>
    ))}
  </ul>
);
