import React from 'react';
import { CatalogItem } from '../types/robotics';
import { COMPONENT_BY_ID, ComponentInfo, SpecValue, specLines } from '../data/components';
import {
  FINISHES,
  THREAD,
  hardwareFinish,
  hardwareName,
  hardwareSubtitle,
  hardwareShopUrl,
  isMetric,
  motionOf,
} from '../data/hardware';
import { usePartThumbnail } from '../three/partThumbnails';
import {
  MetaLine,
  Tooltip,
  ArrowUpRightIcon,
  CartIcon,
  DrawingIcon,
  FileIcon,
  ShapeIcon,
  VerifiedIcon,
} from '../design-system';

const fmt = (v: number) => String(Math.round(v * 100) / 100);

export const SizeLine: React.FC<{ w: number; h: number; d: number }> = ({ w, h, d }) => (
  <span className="tabular text-white/85">
    {fmt(w)} × {fmt(h)} × {fmt(d)}
    <span className="text-white/40"> mm</span>
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
    className={`inline-flex items-center justify-center gap-1.5 h-8 ${children ? 'px-3' : 'w-8'} rounded-lg text-[13px] font-medium whitespace-nowrap cursor-default transition-[background-color,color,transform] duration-150 active:scale-[0.97] ${
      primary
        ? 'bg-[#0d99ff] hover:bg-[#2ba5ff] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]'
        : 'bg-white/[0.07] hover:bg-white/[0.11] text-white/90'
    }`}
  >
    {icon}
    {children}
  </a>
);

export const ComponentLinks: React.FC<{ c: ComponentInfo }> = ({ c }) => (
  <div className="flex flex-wrap gap-1.5">
    {c.links.amazon && (
      <LinkButton href={c.links.amazon.url} icon={<CartIcon className="w-3.5 h-3.5" />} primary>
        {c.links.amazon.kind === 'product' ? 'Buy on Amazon' : 'Find on Amazon'}
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

export const SpecRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-4 py-[5px] text-[13px] leading-snug">
    <dt className="shrink-0 text-white/50">{label}</dt>
    <dd className="min-w-0 text-right text-white/90 tabular [overflow-wrap:anywhere]">{children}</dd>
  </div>
);

export const SpecList: React.FC<{ rows: Array<[string, React.ReactNode]> }> = ({ rows }) => (
  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
    {rows.map(([label, value]) => (
      <React.Fragment key={label}>
        <dt className="text-white/45 whitespace-nowrap">{label}</dt>
        <dd className="text-white/85 tabular min-w-0 [overflow-wrap:anywhere]">{value}</dd>
      </React.Fragment>
    ))}
  </dl>
);

const modelSourceText = (c: ComponentInfo): string => {
  if (c.model.source === 'manufacturer') {
    return `3D model from ${c.model.by}`;
  }

  if (c.model.source === 'checked') {
    return `3D model by ${c.model.by}, checked against the ${c.model.checkedAgainst} drawing`;
  }

  return `Modeled from the ${c.model.by} drawing`;
};

export const ModelSource: React.FC<{ c: ComponentInfo }> = ({ c }) => (
  <div className="flex items-start gap-1.5 text-[12px] text-white/45 leading-snug">
    <ShapeIcon className="w-3.5 h-3.5 mt-px shrink-0" />
    <span>
      {modelSourceText(c)}
      {c.model.license && <span className="block">{c.model.license}</span>}
    </span>
  </div>
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

export const Stat: React.FC<{ label: string; children: React.ReactNode; wide?: boolean; clamp?: boolean }> = ({
  label,
  children,
  wide,
  clamp = true,
}) => (
  <div className={`min-w-0 rounded-[10px] bg-white/[0.045] px-2.5 py-2 ${wide ? 'col-span-2' : ''}`}>
    <div className="text-[12px] text-white/40 truncate">{label}</div>
    <div
      className={`mt-0.5 tabular text-white/90 leading-snug [overflow-wrap:anywhere] ${
        wide ? 'text-[14px] font-medium' : `text-[12.5px] ${clamp ? 'line-clamp-2' : ''}`
      }`}
    >
      {children}
    </div>
  </div>
);

interface HeroBadge {
  icon: React.ReactNode;
  label: string;
}

const sourceBadge = (c: ComponentInfo): HeroBadge => {
  if (c.model.source === 'manufacturer') {
    return { icon: <VerifiedIcon className="w-3.5 h-3.5 text-[#0d99ff]" />, label: `${c.model.by} CAD` };
  }

  if (c.model.source === 'checked') {
    return { icon: <VerifiedIcon className="w-3.5 h-3.5 text-[#0d99ff]" />, label: 'Checked against drawing' };
  }

  return { icon: <DrawingIcon className="w-3.5 h-3.5 text-white/60" />, label: 'From the drawing' };
};

const heroBadge = (source: ComponentInfo | 'iso' | undefined): HeroBadge | undefined => {
  if (source === 'iso') {
    return ISO_BADGE;
  }

  return source ? sourceBadge(source) : undefined;
};

const ISO_BADGE: HeroBadge = { icon: <VerifiedIcon className="w-3.5 h-3.5 text-[#0d99ff]" />, label: 'ISO dimensions' };

export const Hero: React.FC<
  {
    item: CatalogItem;
    source?: ComponentInfo | 'iso';
    className?: string;
  } & Omit<React.HTMLAttributes<HTMLDivElement>, 'className'>
> = ({ item, source, className = 'h-[136px]', ...rest }) => {
  const thumb = usePartThumbnail(item);
  const badge = heroBadge(source);

  return (
    <div
      {...rest}
      className={`relative bg-[radial-gradient(ellipse_at_50%_45%,rgba(255,255,255,0.13),rgba(255,255,255,0.02)_60%,transparent_100%)] ${className}`}
    >
      {thumb ? (
        <img
          src={thumb}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain p-2.5 animate-fade-in drop-shadow-[0_10px_14px_rgba(0,0,0,0.45)]"
        />
      ) : (
        <div className="absolute inset-0 shimmer" />
      )}
      {badge && (
        <div className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 h-6 pl-1.5 pr-2 rounded-full bg-black/45 ring-1 ring-white/10 text-[12px] font-medium text-white/80 backdrop-blur-md">
          {badge.icon}
          {badge.label}
        </div>
      )}
    </div>
  );
};

export const Header: React.FC<{
  title: string;
  subtitle: string | string[];
  description?: string;
  clamp?: boolean;
}> = ({ title, subtitle, description, clamp = true }) => (
  <div className="px-4 pt-3">
    <div className="text-[15px] font-semibold text-white/95 leading-tight">{title}</div>
    <MetaLine items={[subtitle].flat()} className={`text-[12.5px] text-white/45 mt-1 ${clamp ? '' : 'flex-wrap'}`} />
    {description && (
      <p className={`text-[13px] text-white/70 leading-relaxed mt-2 ${clamp ? 'line-clamp-2' : ''}`}>{description}</p>
    )}
  </div>
);

export const CardSection: React.FC<{
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  clamp?: boolean;
}> = ({ icon, label, children, clamp = true }) => (
  <div className="mt-3 border-t border-white/[0.07] px-4 pt-3">
    <div className="flex items-center gap-1.5 text-[12px] font-medium text-white/45">
      {icon}
      {label}
    </div>
    <div className={`mt-1 text-[12.5px] text-white/65 leading-relaxed ${clamp ? 'line-clamp-3' : ''}`}>{children}</div>
  </div>
);

export const BuyLinks: React.FC<{ c: ComponentInfo; primary?: boolean }> = ({ c, primary = true }) => (
  <>
    {c.links.amazon && (
      <div className="flex-1 min-w-0 [&>a]:w-full">
        <LinkButton href={c.links.amazon.url} icon={<CartIcon className="w-3.5 h-3.5" />} primary={primary}>
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

const IconLink: React.FC<{ href: string; icon: React.ReactNode; label: string }> = ({ href, icon, label }) => (
  <Tooltip label={label} side="bottom">
    <LinkButton href={href} icon={icon} label={label} />
  </Tooltip>
);

const Footer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-3 border-t border-white/[0.07] p-3 flex items-center gap-1.5">{children}</div>
);

export const CatalogDetails: React.FC<{ item: CatalogItem }> = ({ item }) => {
  const c = item.componentId ? COMPONENT_BY_ID[item.componentId] : undefined;
  const d = item.defaultDimensions;
  const size = <SizeLine w={d.width} h={d.height} d={d.depth} />;

  if (c) {
    return (
      <div className="pb-0">
        <Hero item={item} source={c} />
        <Header title={c.name} subtitle={[c.manufacturer, c.mpn]} description={c.description} />
        <div className="px-4 mt-3 grid grid-cols-2 gap-1.5">
          <Stat label="Size" wide>
            {size}
          </Stat>
          {c.specs.slice(0, 4).map(([label, value]) => (
            <Stat key={label} label={label}>
              <SpecText value={value} />
            </Stat>
          ))}
        </div>
        <Footer>
          <BuyLinks c={c} />
        </Footer>
      </div>
    );
  }

  const hw = item.hardware;

  if (hw) {
    const finish = FINISHES[hardwareFinish(hw)];

    return (
      <div>
        <Hero item={item} source="iso" />
        <Header title={hardwareName(hw)} subtitle={hardwareSubtitle(hw)} />
        <div className="px-4 mt-3 grid grid-cols-2 gap-1.5">
          <Stat label="Size" wide>
            {size}
          </Stat>
          {isMetric(hw.size) && <Stat label="Thread">{`${hw.size} × ${THREAD[hw.size].pitch}`}</Stat>}
          {motionOf(hw.type)
            ?.facts(hw)
            .slice(0, 1)
            .map((f) => (
              <Stat key={f.label} label={f.label}>{`${f.value}${f.unit ? ` ${f.unit}` : ''}`}</Stat>
            ))}
          <Stat label="Finish">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full ring-1 ring-white/20 shrink-0"
                style={{ background: finish.color }}
              />
              {finish.label}
            </span>
          </Stat>
        </div>
        <Footer>
          <div className="flex-1 min-w-0 [&>a]:w-full">
            <LinkButton href={hardwareShopUrl(hw)} icon={<CartIcon className="w-3.5 h-3.5" />} primary>
              Find on Amazon
            </LinkButton>
          </div>
        </Footer>
      </div>
    );
  }

  return (
    <div className="pb-4">
      <Hero item={item} />
      <Header title={item.name} subtitle="Resizable in the Inspector" description={item.description} />
      <div className="px-4 mt-3">
        <Stat label="Size" wide>
          {size}
        </Stat>
      </div>
    </div>
  );
};
