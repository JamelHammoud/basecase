import { Button, FieldRow, Modal, NumberInput, Select, Spinner } from '../../design-system';
import type { AssemblyCradle } from '../../workspace/useAssemblyCradle';
import { sizeLabel } from '../../utils/size';

function cradleProblem(error: string): string {
  if (error.includes('driver')) return 'Driver access is blocked.';

  if (error.includes('move')) return 'Assembly access is blocked.';

  if (error.includes('plate')) return 'The cradle doesn’t fit the printer.';

  if (error.includes('tool')) return 'The required tool geometry is unresolved.';

  return 'Choose another subassembly or resting face.';
}

export function CradleSheet({ cradle }: { cradle: AssemblyCradle }) {
  const face = cradle.down ? cradle.directions.findIndex((direction) => direction.every((value, axis) => value === cradle.down?.[axis])) : -1;
  const dimensions = cradle.prepared?.identity.dimensionsMm;

  return <Modal isOpen={cradle.open} onClose={cradle.close} title="Assembly cradle"
    action={{ label: 'Make Assembly Cradle', onClick: () => void cradle.make(), disabled: cradle.busy || !cradle.down || !cradle.selected }}>
    <div className="flex flex-col gap-4">
      <FieldRow label="Subassembly"><Select aria-label="Subassembly" value={cradle.selected} onChange={(event) => cradle.select(event.target.value)} options={cradle.choices.map((choice) => ({ value: choice.id, label: choice.name }))} /></FieldRow>
      <FieldRow label="Resting face"><Select aria-label="Resting face" value={String(face)} onChange={(event) => cradle.face(cradle.directions[Number(event.target.value)])}
        options={[{ value: '-1', label: 'Choose a face' }, ...cradle.directions.map((_, index) => ({ value: String(index), label: `Face ${index + 1}` }))]} /></FieldRow>
      <FieldRow label="Clearance"><NumberInput aria-label="Clearance" value={cradle.clearanceMm} min={0.02} max={3} step={0.1} precision={2} onChange={cradle.clearance} /></FieldRow>
      <FieldRow label="Base thickness"><NumberInput aria-label="Base thickness" value={cradle.baseMm} min={0.84} max={20} step={0.5} precision={2} onChange={cradle.base} /></FieldRow>
      <FieldRow label="Support depth"><NumberInput aria-label="Support depth" value={cradle.depthMm} min={0.84} max={30} step={1} precision={2} onChange={cradle.depth} /></FieldRow>
      {cradle.busy && <Spinner className="w-4 h-4" />}
      {cradle.error && <p role="alert" className="text-[13px] text-red-400">{cradleProblem(cradle.error)}</p>}
      {dimensions && <div className="flex items-center justify-between gap-3 text-[13px] text-white/90">
        <span>{sizeLabel(dimensions)}</span>
        <Button onClick={cradle.print}>Print</Button>
      </div>}
      <p className="text-[13px] text-white/50">Holding strength and physical printer fit haven’t been measured.</p>
    </div>
  </Modal>;
}
