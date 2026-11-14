import React from 'react';
import { catalogItemFromKey, catalogRef } from '../../data/catalog';
import { COMPONENT_BY_ID, ComponentInfo } from '../../data/components';
import { HardwareSpec, hardwareName, hardwareShopUrl, hardwareSubtitle } from '../../data/hardware';
import type { CatalogItem, PartDimensions } from '../../types/robotics';
import { Button, MetaLine, Section, Tooltip, CartIcon, PlusIcon } from '../../design-system';
import {
  ComponentLinks,
  DetailBlock,
  Hero,
  LinkButton,
  ModelOrigin,
  makerSubtitle,
  SizeLine,
  SpecRow,
  SpecRows,
} from '../PartDetails';
import { HardwareConfigurator, HardwareSpecs } from '../HardwareConfigurator';
import { keySpecs } from '../../utils/keySpecs';
import { type ShopLinkKind, shopLinkLabel } from '../../utils/shopLink';
import { hardwareItem, type View } from './partsViews';
import { ResultRow, dragProps } from './rows';

const PAGE_HERO = 'preview !rounded-[14px] mx-[12px] h-[184px]';

const PageTitle: React.FC<{ title: string; subtitle: string | string[]; description?: string }> = ({
  title,
  subtitle,
  description,
}) => (
  <div className="px-[12px] pt-4 pb-4">
    <h2 className="text-[17px] font-semibold text-white/95 leading-tight">{title}</h2>
    <MetaLine items={[subtitle].flat()} className="mt-1 text-[13px] text-white/50" />
    {description && <p className="mt-2.5 text-[13px] text-white/70 leading-relaxed">{description}</p>}
  </div>
);

const ComponentSpecs: React.FC<{ c: ComponentInfo; d: PartDimensions }> = ({ c, d }) => (
  <>
    <Section title="Key specs">
      <dl className="-my-[5px]">
        {keySpecs(c, d).map((k) => (
          <SpecRow key={k.label} label={k.label}>
            {k.mm ? <SizeLine mm={k.mm} /> : k.value}
          </SpecRow>
        ))}
      </dl>
    </Section>
    <Section title="All specs" collapsible defaultOpen={false}>
      <SpecRows c={c} d={d} />
    </Section>
  </>
);

const ComponentDetails: React.FC<{ c: ComponentInfo }> = ({ c }) => (
  <Section title="Details" collapsible defaultOpen={false}>
    <dl className="-my-[5px]">
      <SpecRow label="Part number">{c.mpn}</SpecRow>
    </dl>
    <DetailBlock label="Mounting">{c.mounting}</DetailBlock>
    <ModelOrigin c={c} />
    <ComponentLinks c={c} shop={false} />
  </Section>
);

export const ItemPage: React.FC<{
  ref_: string;
  onAdd: (i: CatalogItem) => void;
  onOpen: (i: CatalogItem) => void;
}> = ({ ref_, onAdd, onOpen }) => {
  const item = catalogItemFromKey(ref_);
  const c = item?.componentId ? COMPONENT_BY_ID[item.componentId] : undefined;

  if (!item || !c) return null;

  const d = item.defaultDimensions;
  const pairs = (c.pairsWith ?? []).map((r) => catalogItemFromKey(r)).filter((i): i is CatalogItem => !!i);

  return (
    <div className="pb-2">
      <Hero item={item} className={PAGE_HERO} {...dragProps(item)} />
      <PageTitle title={item.name} subtitle={makerSubtitle(c)} description={item.description} />
      <div className="border-t border-white/[0.06]">
        <ComponentSpecs c={c} d={d} />
        <ComponentDetails c={c} />
        {pairs.length > 0 && (
          <Section title="Goes with">
            <div className="-mx-[6px] !mt-0">
              {pairs.map((p) => (
                <ResultRow key={catalogRef(p)} item={p} onOpen={() => onOpen(p)} onAdd={() => onAdd(p)} />
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
};

export const HardwarePage: React.FC<{ spec: HardwareSpec; onChange: (s: HardwareSpec) => void }> = ({
  spec,
  onChange,
}) => {
  const item = hardwareItem(spec);

  return (
    <div className="pb-4">
      <Hero item={item} className={PAGE_HERO} {...dragProps(item)} />
      <PageTitle title={hardwareName(spec)} subtitle={hardwareSubtitle(spec)} />
      <div className="border-t border-white/[0.06]">
        <HardwareConfigurator spec={spec} onChange={(s) => onChange(s)} />
        <HardwareSpecs spec={spec} />
      </div>
    </div>
  );
};

const AddBar: React.FC<{ onAdd: () => void; children?: React.ReactNode }> = ({ onAdd, children }) => (
  <div className="shrink-0 px-[12px] py-3 border-t border-white/[0.06] flex items-center gap-2">
    <Button
      variant="primary"
      size="sm"
      fullWidth
      className="flex-1 min-w-0"
      icon={<PlusIcon className="w-3.5 h-3.5" />}
      onClick={onAdd}
    >
      Add
    </Button>
    {children}
  </div>
);

const ShopLink: React.FC<{ kind: ShopLinkKind; href: string }> = ({ kind, href }) => {
  const label = shopLinkLabel(kind, href);

  return (
    <Tooltip label={label}>
      <LinkButton href={href} icon={<CartIcon className="w-3.5 h-3.5" />} label={label} />
    </Tooltip>
  );
};

const ItemFooter: React.FC<{ ref_: string; onAdd: (i: CatalogItem) => void }> = ({ ref_, onAdd }) => {
  const item = catalogItemFromKey(ref_);

  if (!item) return null;

  const amazon = item.componentId ? COMPONENT_BY_ID[item.componentId]?.links.amazon : undefined;

  return <AddBar onAdd={() => onAdd(item)}>{amazon && <ShopLink kind={amazon.kind} href={amazon.url} />}</AddBar>;
};

const HardwareFooter: React.FC<{ spec: HardwareSpec; onAdd: (i: CatalogItem) => void }> = ({ spec, onAdd }) => {
  const item = hardwareItem(spec);

  return (
    <AddBar onAdd={() => onAdd(item)}>
      <ShopLink kind="search" href={hardwareShopUrl(spec)} />
    </AddBar>
  );
};

export const PageFooter: React.FC<{ view: View; onAdd: (i: CatalogItem) => void }> = ({ view, onAdd }) => {
  if (view.kind === 'item') return <ItemFooter ref_={view.ref} onAdd={onAdd} />;

  if (view.kind !== 'hardware') return null;

  return <HardwareFooter spec={view.spec} onAdd={onAdd} />;
};
