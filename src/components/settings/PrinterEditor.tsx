import React, { useState } from 'react';
import { Button, NumberInput, Select, TextInput } from '../../design-system';
import {
  CONNECTION_LABELS,
  PRINTER_MODELS,
  printerModel,
  type ConnectionKind,
  type MyPrinter,
} from '../../data/printers';
import { printBridge, type SavedPrinter } from '../../print/printBridge';
import { SettingsRow as Row } from '../SettingsRows';

const CUSTOM = 'custom';
const NONE = 'none';
const BAMBU_KINDS: ConnectionKind[] = ['bambu-studio', 'bambu-connect', 'bambu-lan'];
const OTHER_KINDS: ConnectionKind[] = ['moonraker', 'prusalink', 'octoprint'];
const NEEDS_HOST = new Set<ConnectionKind>(['bambu-lan', 'moonraker', 'prusalink', 'octoprint']);

const SECRET_LABEL: Partial<Record<ConnectionKind, string>> = {
  'bambu-lan': 'Access code',
  moonraker: 'API key',
  prusalink: 'API key',
  octoprint: 'API key',
};

const HINTS: Partial<Record<ConnectionKind, string>> = {
  'bambu-studio': 'Opens sliced plates in Bambu Studio, where Print sends them to the printer.',
  'bambu-connect': 'Hands sliced plates to Bambu Connect, where you pick the printer and start.',
  'bambu-lan':
    'Starts prints and shows progress from Basecase. Needs LAN Only and Developer Mode on the printer, which Bambu doesn’t support.',
};

const MODEL_OPTIONS = [
  ...PRINTER_MODELS.map((m) => ({ value: m.id, label: m.name })),
  { value: CUSTOM, label: 'Custom printer' },
];

const kindsFor = (modelId: string) => (printerModel(modelId)?.vendor === 'BBL' ? BAMBU_KINDS : OTHER_KINDS);

interface PrinterEditorProps {
  printer: SavedPrinter;
  onChange: (next: MyPrinter) => void;
  onSecret: (secret: string) => Promise<unknown>;
}

const CustomBed: React.FC<{ printer: SavedPrinter; onChange: (next: MyPrinter) => void }> = ({ printer, onChange }) => {
  const size = printer.custom ?? { width: 220, depth: 220, height: 250 };
  const field = (key: keyof typeof size, label: string) => (
    <div className="w-[96px]">
      <NumberInput
        value={size[key]}
        min={20}
        max={1000}
        step={5}
        precision={0}
        unit="mm"
        title={label}
        onChange={(v, live) => !live && onChange({ ...printer, custom: { ...size, [key]: v } })}
      />
    </div>
  );

  return (
    <Row label="Build volume" hint="Width × depth × height">
      <div className="flex gap-[8px]">
        {field('width', 'Width')}
        {field('depth', 'Depth')}
        {field('height', 'Height')}
      </div>
    </Row>
  );
};

const ConnectionTest: React.FC<{ id: string }> = ({ id }) => {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const run = async () => {
    setTesting(true);

    try {
      setResult(await printBridge.test(id));
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Row
      label="Connection"
      hint={result && <span className={result.ok ? 'text-white/60' : 'text-red-400'}>{result.message}</span>}
    >
      <Button size="sm" variant="secondary" onClick={() => void run()} disabled={testing}>
        {testing ? 'Testing…' : 'Test Connection'}
      </Button>
    </Row>
  );
};

const SecretField: React.FC<{ label: string; saved: boolean; onSecret: (secret: string) => Promise<unknown> }> = ({
  label,
  saved,
  onSecret,
}) => {
  const [draft, setDraft] = useState('');

  return (
    <Row label={label} hint={saved && !draft ? 'Saved' : undefined}>
      <div className="w-[200px]">
        <TextInput
          type="password"
          value={draft}
          placeholder={saved ? '••••••••' : ''}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft) void onSecret(draft).then(() => setDraft(''));
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label={label}
        />
      </div>
    </Row>
  );
};

const ModelRows: React.FC<Omit<PrinterEditorProps, 'onSecret'>> = ({ printer, onChange }) => {
  const model = printer.custom ? null : printerModel(printer.modelId);

  return (
    <>
      <Row label="Name">
        <div className="w-[200px]">
          <TextInput
            value={printer.nickname}
            onChange={(e) => onChange({ ...printer, nickname: e.target.value })}
            aria-label="Name"
          />
        </div>
      </Row>
      <Row label="Model">
        <div className="w-[240px]">
          <Select
            value={printer.custom ? CUSTOM : printer.modelId}
            options={MODEL_OPTIONS}
            aria-label="Model"
            onChange={(e) =>
              e.target.value === CUSTOM
                ? onChange({ ...printer, custom: printer.custom ?? { width: 220, depth: 220, height: 250 } })
                : onChange({ ...printer, modelId: e.target.value, custom: undefined, connection: undefined })
            }
          />
        </div>
      </Row>
      {printer.custom && <CustomBed printer={printer} onChange={onChange} />}
      {model && model.nozzles.length > 1 && (
        <Row label="Nozzle">
          <div className="w-[112px]">
            <Select
              value={String(printer.nozzle)}
              options={model.nozzles.map((n) => ({ value: String(n), label: `${n} mm` }))}
              aria-label="Nozzle"
              onChange={(e) => onChange({ ...printer, nozzle: Number(e.target.value) })}
            />
          </div>
        </Row>
      )}
    </>
  );
};

const TextRow: React.FC<{
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}> = ({ label, hint, value, placeholder, onChange }) => (
  <Row label={label} hint={hint}>
    <div className="w-[200px]">
      <TextInput
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      />
    </div>
  </Row>
);

const ConnectionRows: React.FC<PrinterEditorProps> = ({ printer, onChange, onSecret }) => {
  const kind = printer.connection?.kind;
  const kinds = kindsFor(printer.modelId);
  const setConnection = (next: Partial<NonNullable<MyPrinter['connection']>> | null) =>
    onChange({
      ...printer,
      connection: next === null ? undefined : { kind: kind ?? kinds[0], ...printer.connection, ...next },
    });
  const secretLabel = kind && SECRET_LABEL[kind];

  return (
    <>
      <Row label="Send prints with" hint={kind && HINTS[kind]}>
        <div className="w-[240px]">
          <Select
            value={kind ?? NONE}
            options={[
              { value: NONE, label: 'Export only' },
              ...kinds.map((k) => ({ value: k, label: CONNECTION_LABELS[k] })),
            ]}
            aria-label="Send prints with"
            onChange={(e) => setConnection(e.target.value === NONE ? null : { kind: e.target.value as ConnectionKind })}
          />
        </div>
      </Row>
      {kind && NEEDS_HOST.has(kind) && (
        <TextRow
          label="Address"
          value={printer.connection?.host ?? ''}
          placeholder="e.g. 192.168.1.40"
          onChange={(host) => setConnection({ host })}
        />
      )}
      {kind === 'bambu-lan' && (
        <TextRow
          label="Serial number"
          hint="Printer screen: Settings → Device"
          value={printer.connection?.serial ?? ''}
          onChange={(serial) => setConnection({ serial })}
        />
      )}
      {secretLabel && <SecretField label={secretLabel} saved={!!printer.hasSecret} onSecret={onSecret} />}
      {kind && <ConnectionTest id={printer.id} />}
    </>
  );
};

export const PrinterEditor: React.FC<PrinterEditorProps> = (props) => (
  <>
    <ModelRows printer={props.printer} onChange={props.onChange} />
    <ConnectionRows {...props} />
  </>
);
