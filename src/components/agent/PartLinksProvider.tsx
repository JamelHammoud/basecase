import React, { createContext, useContext } from 'react';
import { buildPartIndex, NamedPart, PartIndex, partIdsOf, remarkPartLinks, splitParts } from './partIndex';

interface PartLinks {
  index: PartIndex;
  select: (ids: string[]) => void;
}

const PartLinksContext = createContext<PartLinks | null>(null);

export const PartLinksProvider: React.FC<{
  parts: NamedPart[];
  onSelect: (ids: string[]) => void;
  children: React.ReactNode;
}> = ({ parts, onSelect, children }) => (
  <PartLinksContext value={{ index: buildPartIndex(parts), select: onSelect }}>{children}</PartLinksContext>
);

export function usePartMarkdown() {
  const links = useContext(PartLinksContext);

  if (!links) return {};

  return {
    remarkPlugins: [remarkPartLinks(links.index)],
    onInternalLink: (href: string) => {
      const ids = partIdsOf(href);

      if (ids) links.select(ids);
    },
  };
}

export const LinkedText: React.FC<{ text: string }> = ({ text }) => {
  const links = useContext(PartLinksContext);

  if (!links) return <>{text}</>;

  return (
    <>
      {splitParts(text, links.index).map((run, i) => {
        const ids = run.ids;

        if (!ids) return <React.Fragment key={i}>{run.text}</React.Fragment>;

        return (
          <button
            key={i}
            type="button"
            onClick={() => links.select(ids)}
            className="text-[#5cb8ff] hover:underline underline-offset-2 cursor-pointer"
          >
            {run.text}
          </button>
        );
      })}
    </>
  );
};
