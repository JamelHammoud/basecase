import React from 'react';
import { EntryMeta } from './EntryMeta';
import { PageTitle } from './PageTitle';
import { entryPath, type Entry } from './siteContent';

interface EntryListProps {
  title: string;
  entries: Entry[];
  empty: string;
  dated?: boolean;
}

export const EntryList: React.FC<EntryListProps> = ({ title, entries, empty, dated }) => (
  <>
    <PageTitle>{title}</PageTitle>
    {entries.length === 0 ? (
      <p className="mt-[40px] text-[16px] text-white/50">{empty}</p>
    ) : (
      <ul className="mt-[40px] list-none m-0 p-0 flex flex-col gap-[28px]">
        {entries.map((entry) => (
          <li key={entry.slug} className="flex flex-col gap-[6px]">
            {dated && <EntryMeta entry={entry} />}
            <h2 className="text-[18px] leading-[1.3] font-semibold text-white/90">
              <a href={entryPath(entry)} className="hover:underline underline-offset-2">
                {entry.title}
              </a>
            </h2>
            {entry.summary && <p className="text-[15px] leading-[1.5] text-white/60">{entry.summary}</p>}
          </li>
        ))}
      </ul>
    )}
  </>
);
