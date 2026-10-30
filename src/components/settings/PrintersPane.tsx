import React, { useState } from 'react';
import { Button, ChevronDownIcon, ChevronRightIcon, DeleteIcon, IconButton } from '../../design-system';
import { CONNECTION_LABELS, FALLBACK_MODEL_ID, modelOf, type MyPrinter } from '../../data/printers';
import type { PrintersState } from '../../app/usePrinters';
import { printBridge, type Discovered, type SavedPrinter } from '../../print/printBridge';
import { SettingsGroup as Group, SettingsRow as Row } from '../SettingsRows';
import { PrinterEditor } from './PrinterEditor';

const newId = () => `printer-${Date.now().toString(36)}`;

function summary(p: SavedPrinter) {
  const model = modelOf(p);

  return [
    model.name,
    `${p.nozzle} mm nozzle`,
    p.connection ? CONNECTION_LABELS[p.connection.kind] : 'Export only',
  ].join(', ');
}

const PrinterRow: React.FC<{
  printer: SavedPrinter;
  open: boolean;
  onToggle: () => void;
  onDefault: () => void;
  onRemove: () => void;
}> = ({ printer, open, onToggle, onDefault, onRemove }) => (
  <Row
    label={
      <button type="button" onClick={onToggle} className="flex items-center gap-[6px] cursor-default text-left">
        {open ? (
          <ChevronDownIcon className="w-3.5 h-3.5 text-white/40" />
        ) : (
          <ChevronRightIcon className="w-3.5 h-3.5 text-white/40" />
        )}
        {printer.nickname}
      </button>
    }
    hint={summary(printer)}
  >
    <div className="flex items-center gap-[8px]">
      {printer.isDefault ? (
        <span className="text-[12.5px] text-white/45">Default</span>
      ) : (
        <Button size="sm" variant="ghost" onClick={onDefault}>
          Make Default
        </Button>
      )}
      <IconButton icon={<DeleteIcon className="w-4 h-4" />} title="Remove printer" size="sm" onClick={onRemove} />
    </div>
  </Row>
);

const FoundRow: React.FC<{ found: Discovered; onAdd: () => void }> = ({ found, onAdd }) => (
  <Row label={found.name} hint={[found.host, CONNECTION_LABELS[found.kind]].join(', ')}>
    <Button size="sm" variant="secondary" onClick={onAdd}>
      Add
    </Button>
  </Row>
);

function fromDiscovered(found: Discovered): MyPrinter {
  const bambu = found.kind === 'bambu-lan';

  return {
    id: newId(),
    modelId: found.modelId ?? FALLBACK_MODEL_ID,
    nickname: found.name,
    nozzle: 0.4,
    connection: bambu ? { kind: 'bambu-studio' } : { kind: found.kind, host: found.host },
  };
}

function useDiscovery() {
  const [found, setFound] = useState<Discovered[] | null>(null);
  const [searching, setSearching] = useState(false);

  const search = async () => {
    setSearching(true);

    try {
      setFound(await printBridge.discover());
    } catch {
      setFound([]);
    } finally {
      setSearching(false);
    }
  };

  return { found, searching, search };
}

const SlicersGroup: React.FC<{ state: PrintersState }> = ({ state }) => {
  const slicers = state.printTools?.slicers ?? [];
  const download = state.printTools?.downloads.bambu;

  return (
    <Group title="Slicers">
      {slicers.map((s) => (
        <Row key={s.kind} label={s.name} hint={s.version ? `Version ${s.version}` : undefined} />
      ))}
      {slicers.length === 0 && (
        <Row label="No slicer installed" hint="Basecase slices with Bambu Studio or OrcaSlicer">
          {download && (
            <Button size="sm" variant="secondary" onClick={() => void printBridge.openLink(download)}>
              Get Bambu Studio
            </Button>
          )}
        </Row>
      )}
    </Group>
  );
};

export const PrintersPane: React.FC<{ state: PrintersState }> = ({ state }) => {
  const [list, setList] = useState<SavedPrinter[]>(state.printers);
  const [openId, setOpenId] = useState<string | null>(null);
  const discovery = useDiscovery();

  const commit = (next: SavedPrinter[]) => {
    const withDefault = next.some((p) => p.isDefault) ? next : next.map((p, i) => ({ ...p, isDefault: i === 0 }));

    setList(withDefault);
    void state.savePrinters(withDefault);
  };
  const add = (printer: MyPrinter) => {
    commit([...list, printer]);
    setOpenId(printer.id);
  };

  return (
    <>
      <Group title="My printers">
        {list.map((p) => (
          <React.Fragment key={p.id}>
            <PrinterRow
              printer={p}
              open={openId === p.id}
              onToggle={() => setOpenId(openId === p.id ? null : p.id)}
              onDefault={() => commit(list.map((q) => ({ ...q, isDefault: q.id === p.id })))}
              onRemove={() => commit(list.filter((q) => q.id !== p.id))}
            />
            {openId === p.id && (
              <div className="bg-white/[0.02]">
                <PrinterEditor
                  printer={p}
                  onChange={(next) => commit(list.map((q) => (q.id === p.id ? { ...q, ...next } : q)))}
                  onSecret={async (secret) => {
                    const r = await state.setPrinterSecret(p.id, secret);

                    setList((l) => l.map((q) => (q.id === p.id ? { ...q, hasSecret: r.hasSecret } : q)));
                  }}
                />
              </div>
            )}
          </React.Fragment>
        ))}
        <Row label={list.length ? 'Add another printer' : 'No printers'}>
          <div className="flex gap-[8px]">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void discovery.search()}
              disabled={discovery.searching}
            >
              {discovery.searching ? 'Searching…' : 'Find on Network'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => add({ id: newId(), modelId: FALLBACK_MODEL_ID, nickname: 'Printer', nozzle: 0.4 })}
            >
              Add Printer
            </Button>
          </div>
        </Row>
      </Group>
      {discovery.found && (
        <Group title="On this network">
          {discovery.found.map((f) => (
            <FoundRow key={`${f.kind}:${f.host}`} found={f} onAdd={() => add(fromDiscovered(f))} />
          ))}
          {discovery.found.length === 0 && <Row label="No printers found" hint="Add one by its address instead" />}
        </Group>
      )}
      <SlicersGroup state={state} />
    </>
  );
};
