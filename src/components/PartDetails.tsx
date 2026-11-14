import React from 'react';
import type { CatalogItem, PartDimensions } from '../types/robotics';
import { COMPONENT_BY_ID, ComponentInfo, SpecValue, specLines } from '../data/components';
import { isSourcedId } from '../data/sourcedItems';
import { usePartThumbnail } from '../three/partThumbnails';
import { keySpecs } from '../utils/keySpecs';
import { sizeFigures } from '../utils/size';
import { MetaLine, PreviewImage, Tooltip, ArrowUpRightIcon, CartIcon, FileIcon } from '../design-system';

export const SizeLine: React.FC<{ mm: readonly number[] }> = ({ mm }) => (
  <span className="tabular">
    {sizeFigures(mm)}
    <span className="text-white/50"> mm</span>
  </span>
);

export const LinkButton: React.FC<{
  href: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
  primary?: boolean;
  label?: string;
}> = ({ href, icon, children, primary, label }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    aria-label={label}
    className={`inline-flex items-center justify-center gap-1.5 h-[32px] ${children ? 'px-3' : 'w-[32px]'} rounded-lg text-[13px] font-medium whitespace-nowrap cursor-default transition-[background-color,color,transform] duration-150 active:scale-[0.97] ${
      primary
        ? 'bg-figma-blue-fill hover:bg-figma-blue-fill-hover text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]'
        : 'bg-white/[0.07] hover:bg-white/[0.11] text-white/90'
    }`}
  >
    {icon}
    {children}
  </a>
);

export const ComponentLinks: React.FC<{ c: ComponentInfo; shop?: boolean }> = ({ c, shop = true }) => {
  const amazon = shop ? c.links.amazon : undefined;

  if (!amazon && !c.links.datasheet && !c.links.product) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {amazon && (
        <LinkButton href={amazon.url} icon={<CartIcon className="w-3.5 h-3.5" />} primary>
          {amazon.kind === 'product' ? 'Buy on Amazon' : 'Find on Amazon'}
        </LinkButton>
      )}
      {c.links.datasheet && (
        <LinkButton href={c.links.datasheet} icon={<FileIcon className="w-3.5 h-3.5" />}>
          Datasheet
        </LinkButton>
      )}
      {c.links.product && (
        <LinkButton href={c.links.product} icon={<ArrowUpRightIcon className="w-3.5 h-3.5" />}>
          Product Page
        </LinkButton>
      )}
    </div>
  );
};

export const SpecRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-4 py-[5px] text-[13px] leading-snug">
    <dt className="shrink-0 text-white/50">{label}</dt>
    <dd className="min-w-0 text-right text-white/90 tabular [overflow-wrap:anywhere]">{children}</dd>
  </div>
);

export const DetailBlock: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="text-[13px] leading-relaxed">
    <div className="text-white/50">{label}</div>
    <div className="mt-0.5 text-white/80">{children}</div>
  </div>
);

const modelOrigin = (c: ComponentInfo): string => {
  if (c.model.source === 'manufacturer') return `From ${c.model.by}’s CAD files`;

  if (c.model.source === 'checked') return `By ${c.model.by}, checked against the ${c.model.checkedAgainst} drawing`;

  return `Modeled from the ${c.model.by} drawing`;
};

export const ModelOrigin: React.FC<{ c: ComponentInfo }> = ({ c }) => (
  <DetailBlock label="3D model">
    {modelOrigin(c)}
    {c.model.license && <span className="block text-white/50">{c.model.license}</span>}
  </DetailBlock>
);

export const SpecText: React.FC<{ value: SpecValue }> = ({ value }) => (
  <>
    {specLines(value).map((line) => (
      <span key={line} className="block">
        {line}
      </span>
    ))}
  </>
);

export const SpecRows: React.FC<{ c: ComponentInfo; d: PartDimensions }> = ({ c, d }) => (
  <dl className="-my-[5px]">
    <SpecRow label="Size">
      <SizeLine mm={[d.width, d.height, d.depth]} />
    </SpecRow>
    {c.specs.map(([label, value]) => (
      <SpecRow key={label} label={label}>
        <SpecText value={value} />
      </SpecRow>
    ))}
  </dl>
);

export const Stat: React.FC<{ label: string; children: React.ReactNode; wide?: boolean; clamp?: boolean }> = ({
  label,
  children,
  wide,
  clamp = true,
}) => (
  <div className={`min-w-0 rounded-[10px] bg-white/[0.045] px-2.5 py-2 ${wide ? 'col-span-2' : ''}`}>
    <div className="text-[12px] text-white/50 truncate">{label}</div>
    <div
      className={`mt-0.5 tabular text-white/90 leading-snug [overflow-wrap:anywhere] ${
        wide ? 'text-[14px] font-medium' : `text-[12.5px] ${clamp ? 'line-clamp-2' : ''}`
      }`}
    >
      {children}
    </div>
  </div>
);

type HeroFrameProps = { className?: string } & Omit<React.HTMLAttributes<HTMLDivElement>, 'className'>;

export const HeroImage: React.FC<HeroFrameProps & { src: string | undefined }> = ({
  src,
  className = 'h-[136px]',
  ...rest
}) => (
  <div
    {...rest}
    className={`relative bg-[radial-gradient(ellipse_at_50%_45%,rgba(255,255,255,0.13),rgba(255,255,255,0.02)_60%,transparent_100%)] ${className}`}
  >
    <PreviewImage
      src={src}
      className="absolute inset-0 p-2.5 animate-fade-in drop-shadow-[0_10px_14px_rgba(0,0,0,0.45)]"
    />
  </div>
);

export const Hero: React.FC<HeroFrameProps & { item: CatalogItem }> = ({ item, ...rest }) => (
  <HeroImage src={usePartThumbnail(item)} {...rest} />
);

export const Header: React.FC<{
  title: string;
  subtitle: string | string[];
  description?: string;
  clamp?: boolean;
}> = ({ title, subtitle, description, clamp = true }) => (
  <div className="px-4 pt-3">
    <div className="text-[15px] font-semibold text-white/95 leading-tight">{title}</div>
    <MetaLine items={[subtitle].flat()} className={`text-[12.5px] text-white/50 mt-1 ${clamp ? '' : 'flex-wrap'}`} />
    {description && (
      <p className={`text-[13px] text-white/70 leading-relaxed mt-2 ${clamp ? 'line-clamp-2' : ''}`}>{description}</p>
    )}
  </div>
);

const IconLink: React.FC<{ href: string; icon: React.ReactNode; label: string }> = ({ href, icon, label }) => (
  <Tooltip label={label} side="bottom">
    <LinkButton href={href} icon={icon} label={label} />
  </Tooltip>
);

const BuyLinks: React.FC<{ c: ComponentInfo }> = ({ c }) => (
  <>
    {c.links.amazon && (
      <div className="flex-1 min-w-0 [&>a]:w-full">
        <LinkButton href={c.links.amazon.url} icon={<CartIcon className="w-3.5 h-3.5" />} primary>
          {c.links.amazon.kind === 'product' ? 'Buy on Amazon' : 'Find on Amazon'}
        </LinkButton>
      </div>
    )}
    {c.links.datasheet && (
      <IconLink href={c.links.datasheet} icon={<FileIcon className="w-3.5 h-3.5" />} label="Datasheet" />
    )}
    {c.links.product && (
      <IconLink href={c.links.product} icon={<ArrowUpRightIcon className="w-3.5 h-3.5" />} label="Product page" />
    )}
  </>
);

const Footer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-3 border-t border-white/[0.07] p-3 flex items-center gap-1.5">{children}</div>
);

export const makerSubtitle = (c: ComponentInfo) => [c.manufacturer, isSourcedId(c.id) ? 'Added by Agent' : ''];

export const CatalogDetails: React.FC<{ item: CatalogItem }> = ({ item }) => {
  const c = item.componentId ? COMPONENT_BY_ID[item.componentId] : undefined;

  if (!c) return null;

  const [size, ...rest] = keySpecs(c, item.defaultDimensions);

  return (
    <div>
      <Hero item={item} />
      <Header title={item.name} subtitle={makerSubtitle(c)} description={c.description} />
      <div className="px-4 mt-3 grid grid-cols-2 gap-1.5">
        <Stat label={size.label} wide>
          {size.mm ? <SizeLine mm={size.mm} /> : size.value}
        </Stat>
        {rest.map((k) => (
          <Stat key={k.label} label={k.label} wide={rest.length === 1}>
            {k.value}
          </Stat>
        ))}
      </div>
      {(c.links.amazon || c.links.datasheet || c.links.product) && (
        <Footer>
          <BuyLinks c={c} />
        </Footer>
      )}
    </div>
  );
};
