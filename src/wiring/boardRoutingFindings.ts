const messages: Record<string, string> = {
  'board-format':
    'Import a KiCad 9.0.6 board up to 8 MiB. Use two copper layers, straight tracks and through vias, without external assets.',
  'board-source': 'Import the board exported from this scene before its electrical or mechanical inputs changed.',
  'board-mapping': 'Restore the exported footprints, positions, pads and net assignments in KiCad.',
  'board-outline': 'Restore the exported board outline in KiCad.',
  'board-hole': 'Restore the exported mounting holes in KiCad.',
  'board-geometry': 'Restore the exported board thickness and geometry in KiCad.',
  'board-stale-routing': 'Import the routed board again after updating the electrical or mechanical inputs.',
  'board-validator': 'Use KiCad 9.0.6 with the desktop app to validate the routed board.',
  'board-drc': 'Fix the routed board’s KiCad DRC findings before fabrication.',
  'board-parity': 'Match the routed board to the current schematic before fabrication.',
  'board-unrouted': 'Route the board’s copper connections in KiCad.',
  'board-manufacturing': 'Set the manufacturing source and minimums, and define the two-layer stackup in KiCad.',
  'board-validation': 'Validate the routed board by exporting the schematic package.',
};

export const boardImportMessage = (code: string) => messages[code] ?? messages['board-format'];
