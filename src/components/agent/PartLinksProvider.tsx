import React, { createContext, useContext } from 'react';
import { HoverCard, type LinkPreview } from '../../design-system';
import type { ScenePart } from '../../types/robotics';
import { buildPartIndex, PartIndex, partIdsOf, remarkPartLinks, splitParts } from './partIndex';
import { PART_PREVIEW_WIDTH, PartPreviewCard } from './PartPreviewCard';

interface PartLinks {
  index: PartIndex;
  existing: Set<string>;
  select: (ids: string[]) => void;
  preview: (ids: string[]) => (() => React.ReactNode) | null;
  openGuide?: () => void;
}

export const GUIDE_HREF = '#build-guide';

const PartLinksContext = createContext<PartLinks | null>(null);

function previewFor(parts: ScenePart[], panScroll: boolean) {
  const byId = new Map(parts.map((p) => [p.id, p]));

  return (ids: string[]) => {
    const linked = ids.flatMap((id) => byId.get(id) ?? []);

    return linked.length ? () => <PartPreviewCard parts={linked} panScroll={panScroll} /> : null;
  };
}

export const PartLinksProvider: React.FC<{
  parts: ScenePart[];
  panScroll: boolean;
  onSelect: (ids: string[]) => void;
  onOpenGuide?: () => void;
  children: React.ReactNode;
}> = ({ parts, panScroll, onSelect, onOpenGuide, children }) => (
  <PartLinksContext
    value={{
      index: buildPartIndex(parts),
      existing: new Set(parts.map((p) => p.id)),
      select: onSelect,
      preview: previewFor(parts, panScroll),
      openGuide: onOpenGuide,
    }}
  >
    {children}
  </PartLinksContext>
);

export function usePartSelect() {
  const links = useContext(PartLinksContext);

  return {
    present: (ids: string[]) => (links ? ids.filter((id) => links.existing.has(id)) : []),
    select: (ids: string[]) => links?.select(ids),
  };
}

export function usePartMarkdown() {
  const links = useContext(PartLinksContext);

  if (!links) return {};

  const linkPreview: LinkPreview = (href) => {
    const ids = partIdsOf(href);
    const content = ids && links.preview(ids);

    return content ? { content, width: PART_PREVIEW_WIDTH } : null;
  };

  return {
    remarkPlugins: [remarkPartLinks(links.index)],
    onInternalLink: (href: string) => {
      if (href === GUIDE_HREF) return links.openGuide?.();

      const ids = partIdsOf(href);

      if (ids) links.select(ids);
    },
    linkPreview,
  };
}

const PartLink: React.FC<{ text: string; ids: string[]; links: PartLinks }> = ({ text, ids, links }) => {
  const button = (
    <button
      type="button"
      onClick={() => links.select(ids)}
      className="text-[#5cb8ff] hover:underline underline-offset-2 cursor-pointer"
    >
      {text}
    </button>
  );
  const content = links.preview(ids);

  return content ? (
    <HoverCard content={content} width={PART_PREVIEW_WIDTH} placement="below" inline>
      {button}
    </HoverCard>
  ) : (
    button
  );
};

export const LinkedText: React.FC<{ text: string }> = ({ text }) => {
  const links = useContext(PartLinksContext);

  if (!links) return <>{text}</>;

  return (
    <>
      {splitParts(text, links.index).map((run, i) =>
        run.ids ? (
          <PartLink key={i} text={run.text} ids={run.ids} links={links} />
        ) : (
          <React.Fragment key={i}>{run.text}</React.Fragment>
        ),
      )}
    </>
  );
};
