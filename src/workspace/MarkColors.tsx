import { ColorSwatches } from '../design-system';
import { MARK_COLORS } from '../utils/markColors';

interface MarkColorsProps {
  value: string;
  onChange: (hex: string, live?: boolean) => void;
}

export function MarkColors({ value, onChange }: MarkColorsProps) {
  return <ColorSwatches colors={MARK_COLORS} value={value} onChange={onChange} />;
}
