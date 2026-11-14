const PRINTER = 'on the printer or in its web app (Bambu, Prusa, Mainsail, Fluidd, OctoPrint), not in Basecase';
const SCAN_APP = 'in Basecase Scan, the iPhone app in ios/, whose labels are SwiftUI strings';
const SMARTSCREEN = "in Windows SmartScreen's warning on a downloaded installer";
const SYSTEM_SETTINGS = 'in macOS System Settings or Windows Settings';

export const LABEL_EXCEPTIONS = [
  { label: 'LAN Only', reason: PRINTER },
  { label: 'Device', reason: PRINTER },
  { label: 'Authorization', reason: PRINTER },
  { label: 'Network', reason: PRINTER },
  { label: 'Application Keys', reason: PRINTER },
  { label: 'Scan', reason: SCAN_APP },
  { label: 'Share', reason: SCAN_APP },
  { label: 'More info', reason: SMARTSCREEN },
  { label: 'Run anyway', reason: SMARTSCREEN },
  { label: 'System Settings', reason: SYSTEM_SETTINGS },
  { label: 'Privacy & Security', reason: SYSTEM_SETTINGS },
  { label: 'Privacy & security', reason: SYSTEM_SETTINGS },
  { label: 'Microphone', reason: SYSTEM_SETTINGS },
  { label: 'Access Tokens', reason: 'on huggingface.co, under its account settings' },
  { label: '⇧↩', reason: "a text field's own new line, a described row in Settings ▸ Shortcuts with no handler" },
];
